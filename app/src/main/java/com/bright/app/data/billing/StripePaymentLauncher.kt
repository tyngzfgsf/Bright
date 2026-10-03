package com.bright.app.data.billing

import android.app.Application
import androidx.activity.ComponentActivity
import com.bright.app.BuildConfig
import com.bright.app.R
import com.bright.app.domain.billing.Currency
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Stripe PaymentSheet, with Google Pay offered first when the device supports it and cards as
 * the fallback. The whole payment happens in a bottom sheet over the app — no browser, no
 * external site.
 *
 * PaymentSheet registers an activity-result launcher, which Android only allows during
 * `onCreate`. So [MainActivity][com.bright.app.MainActivity] builds one per activity instance
 * and hands it over with [attach]; [present] then uses whichever is current. Same reasoning as
 * [com.bright.app.data.auth.FirebaseAuthService]'s foreground-activity lookup: no Android type
 * reaches `commonMain`.
 *
 * Distribution note: Bright ships as a sideloaded APK, not through Google Play, so Play Billing
 * isn't required (or available). If the app ever moves to the Play Store, Google's payments
 * policy requires Play Billing for digital subscriptions sold in-app — this class would be
 * swapped for a Play Billing implementation of the same [PaymentLauncher] interface.
 */
class StripePaymentLauncher(private val application: Application) : PaymentLauncher {

    private var sheet: PaymentSheet? = null
    private var pending: CompletableDeferred<PaymentOutcome>? = null

    val isConfigured: Boolean get() = BuildConfig.STRIPE_PUBLISHABLE_KEY.isNotBlank()

    init {
        if (isConfigured) {
            PaymentConfiguration.init(application, BuildConfig.STRIPE_PUBLISHABLE_KEY)
        }
    }

    /** Call from `onCreate`. Replaces the sheet from any previous activity instance. */
    fun attach(activity: ComponentActivity) {
        if (!isConfigured) return
        sheet = PaymentSheet.Builder(::onResult).build(activity)
        // A sheet that was open when the old activity died won't call back; don't hang the caller.
        pending?.complete(PaymentOutcome.Canceled)
        pending = null
    }

    override suspend fun present(request: PaymentRequest, currency: Currency): PaymentOutcome {
        if (!isConfigured) return PaymentOutcome.Failed(application.getString(R.string.billing_error_not_configured))
        val secret = request.clientSecret ?: return PaymentOutcome.Completed
        val current = sheet ?: return PaymentOutcome.Failed(application.getString(R.string.billing_error_generic))

        val deferred = CompletableDeferred<PaymentOutcome>()
        pending?.complete(PaymentOutcome.Canceled)
        pending = deferred

        val configuration = PaymentSheet.Configuration.Builder(application.getString(R.string.app_name))
            .googlePay(
                PaymentSheet.GooglePayConfiguration(
                    environment = if (BuildConfig.STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_")) {
                        PaymentSheet.GooglePayConfiguration.Environment.Production
                    } else {
                        PaymentSheet.GooglePayConfiguration.Environment.Test
                    },
                    // The Stripe account's country, not the buyer's — Google Pay requires the merchant's.
                    countryCode = BuildConfig.STRIPE_MERCHANT_COUNTRY,
                    // Required for setup intents (trial sign-ups), harmless otherwise.
                    currencyCode = currency.code
                )
            )
            // Bank debits etc. settle days later; a subscription that activates "eventually"
            // would leave the trainee staring at a paywall they just paid through.
            .allowsDelayedPaymentMethods(false)
            .build()

        withContext(Dispatchers.Main) {
            when (request.type) {
                IntentType.PAYMENT -> current.presentWithPaymentIntent(secret, configuration)
                IntentType.SETUP -> current.presentWithSetupIntent(secret, configuration)
                IntentType.NONE -> deferred.complete(PaymentOutcome.Completed)
            }
        }
        return deferred.await()
    }

    private fun onResult(result: PaymentSheetResult) {
        val outcome = when (result) {
            is PaymentSheetResult.Completed -> PaymentOutcome.Completed
            is PaymentSheetResult.Canceled -> PaymentOutcome.Canceled
            is PaymentSheetResult.Failed -> PaymentOutcome.Failed(
                result.error.localizedMessage ?: application.getString(R.string.billing_error_generic)
            )
        }
        pending?.complete(outcome)
        pending = null
    }
}
