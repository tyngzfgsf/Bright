package com.bright.app.ui.billing

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.LocalBrightDependencies
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.BillingResult
import com.bright.app.data.billing.PaywallReason
import com.bright.app.data.billing.PurchaseResult
import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.Pricing
import com.bright.app.domain.billing.SubscriptionStatus
import com.bright.app.resources.*
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightButtonStyle
import com.bright.app.util.formatDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource

/** Which cancel dialog is showing. The exit offer always comes first, if the trainee still has it. */
enum class CancelStep { NONE, EXIT_OFFER, CONFIRM }

sealed interface PlanNotice {
    data object OfferApplied : PlanNotice
    data object PurchaseDone : PlanNotice
    data class Error(val text: String) : PlanNotice
}

class PlanViewModel(private val billing: BillingRepository) : ViewModel() {
    val entitlement: StateFlow<Entitlement> = billing.entitlement
    val currency = billing.currency
    val canPurchase = billing.isPurchasingAvailable

    private val _cancelStep = MutableStateFlow(CancelStep.NONE)
    val cancelStep: StateFlow<CancelStep> = _cancelStep

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    private val _notice = MutableStateFlow<PlanNotice?>(null)
    val notice: StateFlow<PlanNotice?> = _notice

    init {
        viewModelScope.launch { billing.refresh() }
    }

    fun startCancel() {
        _cancelStep.value = if (entitlement.value.retentionOfferEligible) CancelStep.EXIT_OFFER else CancelStep.CONFIRM
    }

    fun declineOffer() {
        _cancelStep.value = CancelStep.CONFIRM
    }

    fun dismissCancel() {
        _cancelStep.value = CancelStep.NONE
    }

    fun acceptOffer() = run {
        _cancelStep.value = CancelStep.NONE
        when (val r = billing.cancel(acceptRetentionOffer = true)) {
            is BillingResult.Success -> _notice.value = PlanNotice.OfferApplied
            is BillingResult.Failure -> _notice.value = PlanNotice.Error(r.message)
            else -> Unit
        }
    }

    fun confirmCancel() = run {
        _cancelStep.value = CancelStep.NONE
        (billing.cancel(acceptRetentionOffer = false) as? BillingResult.Failure)?.let {
            _notice.value = PlanNotice.Error(it.message)
        }
    }

    fun resume() = run {
        (billing.resume() as? BillingResult.Failure)?.let { _notice.value = PlanNotice.Error(it.message) }
    }

    fun fixPayment() = run { handle(billing.fixFailedPayment()) }

    fun buy(addOn: AddOn) = run { handle(billing.buyAddOn(addOn)) }

    fun clearNotice() {
        _notice.value = null
    }

    private fun handle(result: PurchaseResult) {
        _notice.value = when (result) {
            PurchaseResult.Success, PurchaseResult.Pending -> PlanNotice.PurchaseDone
            is PurchaseResult.Failed -> PlanNotice.Error(result.message)
            PurchaseResult.Canceled, PurchaseResult.SignInRequired -> null
        }
    }

    private fun run(block: suspend () -> Unit) {
        if (_busy.value) return
        viewModelScope.launch {
            _busy.value = true
            try {
                block()
            } finally {
                _busy.value = false
            }
        }
    }
}

/**
 * Settings' "Plan & billing" block: current plan and dates, usage, the dunning banner, add-on
 * purchases, and cancel (via the exit offer). Hidden entirely when signed out *and* using an own
 * key, since none of it applies then.
 */
@Composable
fun PlanSection(
    isSignedIn: Boolean,
    usesOwnKey: Boolean,
    onOpenPaywall: (PaywallReason) -> Unit
) {
    val app = LocalBrightDependencies.current
    val viewModel: PlanViewModel = viewModel(factory = viewModelFactory { initializer { PlanViewModel(app.billing) } })
    val e by viewModel.entitlement.collectAsState()
    val cancelStep by viewModel.cancelStep.collectAsState()
    val busy by viewModel.busy.collectAsState()
    val notice by viewModel.notice.collectAsState()
    val freezesAvailable by app.billing.streakFreezesAvailable.collectAsState(0)
    val colors = MaterialTheme.colorScheme

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(colors.surfaceVariant)
            .padding(18.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "Bright ${stringResource(planName(e.effectivePlan))}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            if (e.discountActive) {
                Spacer(Modifier.width(8.dp))
                Text(
                    stringResource(Res.string.billing_discount_active),
                    style = MaterialTheme.typography.labelMedium,
                    color = colors.onSurfaceVariant
                )
            }
        }

        val statusLine = when {
            e.status == SubscriptionStatus.TRIALING && e.trialEndsAtMillis > 0 ->
                stringResource(Res.string.billing_status_trial, formatDate(e.trialEndsAtMillis))
            e.hasPaidAccess && e.cancelAtPeriodEnd && e.currentPeriodEndMillis > 0 ->
                stringResource(Res.string.billing_status_cancels, formatDate(e.currentPeriodEndMillis))
            e.hasPaidAccess && e.currentPeriodEndMillis > 0 ->
                stringResource(Res.string.billing_status_renews, formatDate(e.currentPeriodEndMillis))
            else -> null
        }
        statusLine?.let {
            Spacer(Modifier.height(2.dp))
            Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
        }

        // Dunning: say what happened, that it's being handled, and offer the one-tap fix.
        if (e.status == SubscriptionStatus.PAST_DUE) {
            Spacer(Modifier.height(12.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(colors.background)
                    .padding(14.dp)
            ) {
                Text(stringResource(Res.string.billing_status_past_due), style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(10.dp))
                BrightButton(
                    text = stringResource(Res.string.billing_update_payment),
                    onClick = viewModel::fixPayment,
                    loading = busy,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        Spacer(Modifier.height(12.dp))
        when {
            usesOwnKey -> Note(stringResource(Res.string.billing_byok_note))
            !isSignedIn -> Note(stringResource(Res.string.billing_signed_out_note, Pricing.FREE_DRILLS_PER_MONTH))
            e.drillsLimit != null -> Note(stringResource(Res.string.billing_drills_used, e.drillsUsed, e.drillsLimit ?: 0))
        }
        if (isSignedIn && e.bonusDrills > 0) Note(stringResource(Res.string.billing_bonus_drills, e.bonusDrills))
        if (isSignedIn && e.streakFreezesGranted > 0) {
            Note(stringResource(Res.string.billing_streak_freezes, freezesAvailable))
        }

        Spacer(Modifier.height(14.dp))
        BrightButton(
            text = stringResource(if (e.hasPaidAccess) Res.string.billing_change_plan else Res.string.billing_see_plans),
            onClick = { onOpenPaywall(PaywallReason.BROWSE) },
            style = if (e.hasPaidAccess) BrightButtonStyle.OUTLINED else BrightButtonStyle.FILLED,
            modifier = Modifier.fillMaxWidth()
        )

        // Popcorn add-ons, outside of checkout too. Drill packs only where drills are capped.
        if (isSignedIn && viewModel.canPurchase) {
            Spacer(Modifier.height(4.dp))
            if (!usesOwnKey && e.drillsLimit != null) {
                TextButton(onClick = { viewModel.buy(AddOn.DRILL_PACK) }, enabled = !busy) {
                    Text(
                        stringResource(
                            Res.string.billing_buy_drills,
                            Pricing.DRILL_PACK_SIZE,
                            Pricing.addOnPrice(AddOn.DRILL_PACK, viewModel.currency).format()
                        )
                    )
                }
            }
            TextButton(onClick = { viewModel.buy(AddOn.STREAK_FREEZES) }, enabled = !busy) {
                Text(
                    stringResource(
                        Res.string.billing_buy_freezes,
                        Pricing.STREAK_FREEZE_PACK_SIZE,
                        Pricing.addOnPrice(AddOn.STREAK_FREEZES, viewModel.currency).format()
                    )
                )
            }
        }

        if (e.hasPaidAccess) {
            if (e.cancelAtPeriodEnd) {
                TextButton(onClick = viewModel::resume, enabled = !busy) {
                    Text(stringResource(Res.string.billing_resume))
                }
            } else {
                TextButton(onClick = viewModel::startCancel, enabled = !busy) {
                    Text(stringResource(Res.string.billing_cancel), color = colors.onSurfaceVariant)
                }
            }
        }

        notice?.let { n ->
            Spacer(Modifier.height(6.dp))
            Text(
                text = when (n) {
                    PlanNotice.OfferApplied -> stringResource(
                        Res.string.exit_offer_applied,
                        Pricing.RETENTION_DISCOUNT_PERCENT,
                        Pricing.RETENTION_DISCOUNT_MONTHS
                    )
                    PlanNotice.PurchaseDone -> stringResource(Res.string.billing_purchase_done)
                    is PlanNotice.Error -> n.text
                },
                style = MaterialTheme.typography.bodySmall,
                color = colors.onSurfaceVariant
            )
        }
    }

    when (cancelStep) {
        CancelStep.EXIT_OFFER -> AlertDialog(
            onDismissRequest = viewModel::dismissCancel,
            title = { Text(stringResource(Res.string.exit_offer_title)) },
            text = {
                Text(
                    stringResource(
                        Res.string.exit_offer_body,
                        Pricing.RETENTION_DISCOUNT_PERCENT,
                        Pricing.RETENTION_DISCOUNT_MONTHS
                    )
                )
            },
            confirmButton = {
                TextButton(onClick = viewModel::acceptOffer) {
                    Text(
                        stringResource(Res.string.exit_offer_accept, Pricing.RETENTION_DISCOUNT_PERCENT),
                        fontWeight = FontWeight.SemiBold
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::declineOffer) {
                    Text(stringResource(Res.string.exit_offer_decline), color = colors.onSurfaceVariant)
                }
            }
        )
        CancelStep.CONFIRM -> AlertDialog(
            onDismissRequest = viewModel::dismissCancel,
            title = { Text(stringResource(Res.string.cancel_confirm_title)) },
            text = {
                Text(
                    stringResource(
                        Res.string.cancel_confirm_body,
                        stringResource(planName(e.effectivePlan)),
                        if (e.currentPeriodEndMillis > 0) formatDate(e.currentPeriodEndMillis) else "—",
                        Pricing.FREE_DRILLS_PER_MONTH
                    )
                )
            },
            confirmButton = {
                TextButton(onClick = viewModel::confirmCancel) { Text(stringResource(Res.string.cancel_confirm_yes)) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::dismissCancel) {
                    Text(stringResource(Res.string.cancel_confirm_no), fontWeight = FontWeight.SemiBold)
                }
            }
        )
        CancelStep.NONE -> Unit
    }
}

@Composable
private fun Note(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 2.dp)
    )
}
