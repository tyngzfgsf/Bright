package com.bright.app.ui.billing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bright.app.data.auth.AuthService
import com.bright.app.data.auth.SignInResult
import com.bright.app.data.billing.BillingRepository
import com.bright.app.data.billing.PaywallReason
import com.bright.app.data.billing.PurchaseResult
import com.bright.app.data.billing.StorePrice
import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.Currency
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.PlanId
import com.bright.app.domain.billing.Pricing
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class PaywallUiState(
    /** Annual by default: it's the better deal, and showing its per-month price first anchors on it. */
    val period: BillingPeriod = BillingPeriod.ANNUAL,
    val selectedPlan: PlanId = Pricing.RECOMMENDED_PLAN,
    val checkoutOpen: Boolean = false,
    val selectedAddOns: Set<AddOn> = emptySet(),
    val isWorking: Boolean = false,
    val message: PaywallMessage? = null
)

sealed interface PaywallMessage {
    data object SignInRequired : PaywallMessage
    data object Unavailable : PaywallMessage
    data object Pending : PaywallMessage
    data object RestoredNothing : PaywallMessage
    data class Error(val text: String) : PaywallMessage
}

class PaywallViewModel(
    private val billing: BillingRepository,
    private val authService: AuthService?,
    val reason: PaywallReason
) : ViewModel() {

    private val _uiState = MutableStateFlow(PaywallUiState())
    val uiState: StateFlow<PaywallUiState> = _uiState

    val entitlement: StateFlow<Entitlement> = billing.entitlement
    val storePrices: StateFlow<Map<String, StorePrice>> = billing.storePrices

    val isSignedIn: StateFlow<Boolean> = (authService?.currentUser ?: flowOf(null))
        .map { it != null }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    /** Fallback currency for the reference prices, used until (or unless) store prices load. */
    val currency: Currency = billing.currency
    val canPurchaseInApp: Boolean = billing.canPurchaseInApp
    val canPurchaseOnWeb: Boolean = billing.canPurchaseOnWeb

    /** Fires the plan just bought; the screen closes and shows a confirmation. */
    private val _purchased = MutableSharedFlow<PlanId>(extraBufferCapacity = 1)
    val purchased: SharedFlow<PlanId> = _purchased

    init {
        // Plan and trial eligibility may have changed elsewhere (another device, the website).
        viewModelScope.launch { billing.refresh() }
    }

    fun setPeriod(period: BillingPeriod) = update { copy(period = period) }

    fun selectPlan(plan: PlanId) = update { copy(selectedPlan = plan) }

    fun toggleAddOn(addOn: AddOn) = update {
        copy(selectedAddOns = if (addOn in selectedAddOns) selectedAddOns - addOn else selectedAddOns + addOn)
    }

    fun dismissMessage() = update { copy(message = null) }

    fun closeCheckout() = update { copy(checkoutOpen = false) }

    /** The main button. Signs in first if needed (plans follow the account), then checkout. */
    fun continueWithSelected() {
        when {
            canPurchaseInApp -> if (isSignedIn.value) openCheckout() else signInThen { openCheckout() }
            // A build outside the app stores: the website sells the same plans to the same account.
            canPurchaseOnWeb -> billing.openWebCheckout()
            else -> update { copy(message = PaywallMessage.Unavailable) }
        }
    }

    private fun openCheckout() = update {
        // Pre-tick nothing: an add-on the trainee didn't choose is a refund request waiting to happen.
        copy(checkoutOpen = true, selectedAddOns = emptySet(), message = null)
    }

    fun pay() {
        val state = _uiState.value
        if (state.isWorking) return
        viewModelScope.launch {
            update { copy(isWorking = true, message = null) }
            val addOns = Pricing.checkoutAddOnsFor(state.selectedPlan).filter { it in state.selectedAddOns }
            val result = billing.subscribe(state.selectedPlan, state.period, addOns)
            update { copy(isWorking = false) }
            handle(result) {
                update { copy(checkoutOpen = false) }
                _purchased.tryEmit(state.selectedPlan)
            }
        }
    }

    /** Apple requires a visible way to restore purchases; it also rescues a reinstall. */
    fun restore() {
        if (_uiState.value.isWorking) return
        viewModelScope.launch {
            update { copy(isWorking = true) }
            val result = billing.restore()
            update { copy(isWorking = false) }
            handle(result, onPending = { update { copy(message = PaywallMessage.RestoredNothing) } }) {
                _purchased.tryEmit(entitlement.value.effectivePlan)
            }
        }
    }

    private inline fun handle(result: PurchaseResult, onPending: () -> Unit = {
        update { copy(checkoutOpen = false, message = PaywallMessage.Pending) }
    }, onSuccess: () -> Unit) {
        when (result) {
            PurchaseResult.Success -> onSuccess()
            PurchaseResult.Pending -> onPending()
            PurchaseResult.Canceled -> Unit
            PurchaseResult.SignInRequired -> update { copy(message = PaywallMessage.SignInRequired) }
            PurchaseResult.Unavailable -> update { copy(message = PaywallMessage.Unavailable) }
            is PurchaseResult.Failed -> update { copy(message = PaywallMessage.Error(result.message)) }
        }
    }

    /**
     * Whether the selected plan would start with a free trial. The stores make the final call
     * (they track trial eligibility per store account); this mirrors it for the copy.
     */
    fun startsWithTrial(plan: PlanId = _uiState.value.selectedPlan): Boolean =
        plan == PlanId.PLUS && entitlement.value.trialEligible && !entitlement.value.hasPaidAccess

    private fun signInThen(next: () -> Unit) {
        val auth = authService ?: run {
            update { copy(message = PaywallMessage.Unavailable) }
            return
        }
        viewModelScope.launch {
            update { copy(isWorking = true) }
            val result = auth.signIn()
            update { copy(isWorking = false) }
            when (result) {
                SignInResult.Success -> {
                    billing.refresh()
                    next()
                }
                SignInResult.Cancelled -> Unit
                is SignInResult.Failure -> update { copy(message = PaywallMessage.Error(result.message)) }
            }
        }
    }

    private inline fun update(block: PaywallUiState.() -> PaywallUiState) {
        _uiState.value = _uiState.value.block()
    }
}
