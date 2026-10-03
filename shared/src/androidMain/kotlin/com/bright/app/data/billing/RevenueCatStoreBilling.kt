package com.bright.app.data.billing

import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.PlanId
import com.bright.app.domain.billing.Pricing
import com.revenuecat.purchases.kmp.Purchases
import com.revenuecat.purchases.kmp.PurchasesConfiguration
import com.revenuecat.purchases.kmp.ktx.awaitCustomerInfo
import com.revenuecat.purchases.kmp.ktx.awaitGetProducts
import com.revenuecat.purchases.kmp.ktx.awaitLogIn
import com.revenuecat.purchases.kmp.ktx.awaitLogOut
import com.revenuecat.purchases.kmp.ktx.awaitOfferings
import com.revenuecat.purchases.kmp.ktx.awaitPromotionalOffer
import com.revenuecat.purchases.kmp.ktx.awaitPurchase
import com.revenuecat.purchases.kmp.ktx.awaitRestore
import com.revenuecat.purchases.kmp.models.GoogleReplacementMode
import com.revenuecat.purchases.kmp.models.Package
import com.revenuecat.purchases.kmp.models.PurchasesException
import com.revenuecat.purchases.kmp.models.PurchasesTransactionException
import com.revenuecat.purchases.kmp.models.StoreProduct

/**
 * Google Play Billing, through RevenueCat's multiplatform SDK (its Android artifact). RevenueCat
 * validates Play receipts and tells bright-proxy, by webhook, what the trainee now owns. This
 * class never decides a plan itself — after a purchase, [BillingRepository] waits for the backend.
 *
 * Android-only for now: the same SDK on iOS pins RevenueCat iOS 5.67.1, which doesn't compile
 * with Xcode 27's Swift 6.4. The code below is written against the common API and would move
 * back to commonMain unchanged once the project's Kotlin allows RevenueCat KMP 3.x.
 *
 * Store setup this code expects (also in MONETIZATION.md):
 * - Offering **"default"** with packages identified `plus_monthly`, `plus_annual`, `pro_monthly`,
 *   `pro_annual` ([Pricing.lookupKey]). Free trials are the stores' introductory offers on Plus;
 *   RevenueCat applies them automatically to eligible buyers.
 * - Consumable products `addon_drill_pack` and `addon_streak_freezes` in both stores.
 * - Exit offer — Play: a developer-determined offer tagged `retention` on each base plan
 *   (50% off, 3 periods). App Store: a promotional offer with id `retention50`.
 *
 * [apiKey] is the *public* RevenueCat Android SDK key (goog_…); null or blank means
 * this build has no store billing and every call returns [StoreOutcome.Unavailable].
 */
class RevenueCatStoreBilling(private val apiKey: String?) : StoreBilling {

    private var configured = false

    override val isAvailable: Boolean get() = !apiKey.isNullOrBlank()

    private fun purchases(): Purchases? {
        if (!isAvailable) return null
        if (!configured) {
            Purchases.configure(PurchasesConfiguration(apiKey!!))
            configured = true
        }
        return Purchases.sharedInstance
    }

    /**
     * Ties store purchases to the Firebase account, so a plan bought on Android unlocks the web
     * and iOS too, and so the backend's webhook knows whose account to update.
     */
    override suspend fun logIn(uid: String) {
        val p = purchases() ?: return
        runCatching { p.awaitLogIn(uid) }
    }

    override suspend fun logOut() {
        val p = purchases() ?: return
        if (!p.isAnonymous) runCatching { p.awaitLogOut() }
    }

    /** Store prices for every plan and add-on, keyed like [Pricing.lookupKey] / [AddOn.lookupKey]. */
    override suspend fun prices(): Map<String, StorePrice> {
        val p = purchases() ?: return emptyMap()
        return runCatching {
            val packages = p.awaitOfferings().current?.availablePackages.orEmpty()
            val plans = packages.associate { it.identifier to it.storeProduct.toStorePrice() }
            val addOns = p.awaitGetProducts(AddOn.entries.map { it.lookupKey })
                .associate { product -> product.id.substringBefore(':') to product.toStorePrice() }
            plans + addOns
        }.getOrDefault(emptyMap())
    }

    override suspend fun purchasePlan(plan: PlanId, period: BillingPeriod): StoreOutcome {
        val p = purchases() ?: return StoreOutcome.Unavailable
        val key = Pricing.lookupKey(plan, period) ?: return StoreOutcome.Unavailable
        val pkg = findPackage(p, key) ?: return StoreOutcome.Unavailable
        val currentProductId = currentSubscriptionProduct(p)
        return attempt {
            // Switching plans on Play replaces the old subscription instead of stacking a second
            // one. Apple handles upgrades within a subscription group by itself.
            p.awaitPurchase(
                storeProduct = pkg.storeProduct,
                oldProductId = currentProductId,
                replacementMode = GoogleReplacementMode.CHARGE_PRORATED_PRICE
            )
        }
    }

    override suspend fun purchaseAddOn(addOn: AddOn): StoreOutcome {
        val p = purchases() ?: return StoreOutcome.Unavailable
        val product = runCatching { p.awaitGetProducts(listOf(addOn.lookupKey)).firstOrNull() }.getOrNull()
            ?: return StoreOutcome.Unavailable
        return attempt { p.awaitPurchase(product) }
    }

    /**
     * The exit offer, store edition. Play: re-subscribe the same plan through its `retention`
     * offer, replacing the current purchase. App Store: buy the same product with the
     * `retention50` promotional offer. [StoreOutcome.Unavailable] if neither is set up.
     */
    override suspend fun purchaseRetentionOffer(plan: PlanId, period: BillingPeriod): StoreOutcome {
        val p = purchases() ?: return StoreOutcome.Unavailable
        val currentProductId = currentSubscriptionProduct(p)
        val key = Pricing.lookupKey(plan, period) ?: return StoreOutcome.Unavailable
        val product = findPackage(p, key)?.storeProduct ?: return StoreOutcome.Unavailable

        product.subscriptionOptions?.withTag(RETENTION_TAG)?.firstOrNull()?.let { option ->
            return attempt {
                p.awaitPurchase(
                    subscriptionOption = option,
                    oldProductId = currentProductId,
                    replacementMode = GoogleReplacementMode.WITHOUT_PRORATION
                )
            }
        }
        product.discounts.firstOrNull { it.offerIdentifier == APPLE_RETENTION_OFFER }?.let { discount ->
            return attempt {
                val offer = p.awaitPromotionalOffer(discount, product)
                p.awaitPurchase(product, offer)
            }
        }
        return StoreOutcome.Unavailable
    }

    /** "Restore purchases" — required by Apple, and how a reinstall picks up a store plan. */
    override suspend fun restore(): StoreOutcome {
        val p = purchases() ?: return StoreOutcome.Unavailable
        return attempt { p.awaitRestore() }
    }

    /** This store's active subscription product, which Play needs in order to replace it. */
    private suspend fun currentSubscriptionProduct(p: Purchases): String? =
        runCatching { p.awaitCustomerInfo().activeSubscriptions.firstOrNull() }.getOrNull()

    private suspend fun findPackage(p: Purchases, key: String): Package? =
        runCatching { p.awaitOfferings().current?.availablePackages?.firstOrNull { it.identifier == key } }.getOrNull()

    private inline fun attempt(block: () -> Unit): StoreOutcome = try {
        block()
        StoreOutcome.Completed
    } catch (e: PurchasesTransactionException) {
        if (e.userCancelled) StoreOutcome.Canceled else StoreOutcome.Failed(e.error.message)
    } catch (e: PurchasesException) {
        StoreOutcome.Failed(e.error.message)
    }

    private fun StoreProduct.toStorePrice() = StorePrice(
        formatted = price.formatted,
        perMonthFormatted = if (period?.unit?.name == "YEAR") pricePerMonth?.formatted else null
    )

    private companion object {
        const val RETENTION_TAG = "retention"
        const val APPLE_RETENTION_OFFER = "retention50"
    }
}
