package com.bright.app.ui.billing

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.LocalBrightDependencies
import com.bright.app.data.billing.PaywallReason
import com.bright.app.domain.billing.AddOn
import com.bright.app.domain.billing.BillingPeriod
import com.bright.app.domain.billing.Currency
import com.bright.app.domain.billing.Entitlement
import com.bright.app.domain.billing.Money
import com.bright.app.domain.billing.PlanId
import com.bright.app.domain.billing.Pricing
import com.bright.app.resources.*
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightButtonStyle
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

/**
 * The one pricing page, inside the app: three plans at most, one highlighted, outcomes before
 * features, local currency, and an annual toggle that leads with the per-month price.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaywallScreen(
    reason: PaywallReason,
    onClose: () -> Unit,
    /** Called after a successful purchase, with the plan's display name, before closing. */
    onPurchased: (String) -> Unit = {}
) {
    val app = LocalBrightDependencies.current
    val viewModel: PaywallViewModel = viewModel(
        key = "paywall-${reason.name}",
        factory = viewModelFactory { initializer { PaywallViewModel(app.billing, app.authService, reason) } }
    )
    val state by viewModel.uiState.collectAsState()
    val entitlement by viewModel.entitlement.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.purchased.collect { plan ->
            onPurchased(getString(Res.string.paywall_success, getString(planName(plan))))
            onClose()
        }
    }

    val messageText = when (val m = state.message) {
        PaywallMessage.SignInRequired -> stringResource(Res.string.paywall_sign_in_required)
        PaywallMessage.Unavailable -> stringResource(Res.string.paywall_unavailable)
        PaywallMessage.Pending -> stringResource(Res.string.paywall_pending)
        is PaywallMessage.Error -> m.text
        null -> null
    }
    LaunchedEffect(messageText) {
        if (messageText != null) {
            snackbar.showSnackbar(messageText)
            viewModel.dismissMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Filled.Close, contentDescription = stringResource(Res.string.common_back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            PaywallBottomBar(
                state = state,
                entitlement = entitlement,
                currency = viewModel.currency,
                startsWithTrial = viewModel.startsWithTrial(state.selectedPlan),
                onContinue = {
                    if (state.selectedPlan == PlanId.FREE) onClose() else viewModel.continueWithSelected()
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            Text(
                text = stringResource(headlineFor(reason)),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(
                    if (reason == PaywallReason.DRILL_LIMIT) Res.string.paywall_subtitle_drill_limit
                    else Res.string.paywall_subtitle_default
                ),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(Modifier.height(20.dp))
            PeriodToggle(period = state.period, onSelect = viewModel::setPeriod)
            Spacer(Modifier.height(16.dp))

            Pricing.PLANS.forEach { plan ->
                PlanCard(
                    plan = plan,
                    period = state.period,
                    currency = viewModel.currency,
                    selected = state.selectedPlan == plan,
                    isCurrent = entitlement.effectivePlan == plan,
                    onSelect = { viewModel.selectPlan(plan) }
                )
                Spacer(Modifier.height(12.dp))
            }

            Text(
                text = stringResource(Res.string.paywall_footer, viewModel.currency.code),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
            )
        }
    }

    if (state.checkoutOpen) {
        ModalBottomSheet(
            onDismissRequest = viewModel::closeCheckout,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.background
        ) {
            CheckoutSheet(
                state = state,
                currency = viewModel.currency,
                startsWithTrial = viewModel.startsWithTrial(state.selectedPlan),
                dueToday = viewModel.dueToday(state),
                onToggleAddOn = viewModel::toggleAddOn,
                onPay = viewModel::pay
            )
        }
    }
}

private fun headlineFor(reason: PaywallReason): StringResource = when (reason) {
    PaywallReason.DRILL_LIMIT -> Res.string.paywall_title_drill_limit
    PaywallReason.CUSTOM_SCENARIO -> Res.string.paywall_title_custom
    PaywallReason.EXPERT_DEBRIEF -> Res.string.paywall_title_debrief
    PaywallReason.BROWSE, PaywallReason.ONBOARDING -> Res.string.paywall_title_browse
}

fun planName(plan: PlanId): StringResource = when (plan) {
    PlanId.FREE -> Res.string.paywall_plan_free
    PlanId.PLUS -> Res.string.paywall_plan_plus
    PlanId.PRO -> Res.string.paywall_plan_pro
}

@Composable
private fun PeriodToggle(period: BillingPeriod, onSelect: (BillingPeriod) -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surfaceVariant)
            .padding(4.dp)
    ) {
        BillingPeriod.entries.forEach { option ->
            val selected = option == period
            val bg by animateColorAsState(if (selected) colors.background else colors.surfaceVariant, label = "periodBg")
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(bg)
                    .selectable(selected = selected, role = Role.Tab, onClick = { onSelect(option) })
                    .padding(vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(
                        if (option == BillingPeriod.MONTHLY) Res.string.paywall_period_monthly
                        else Res.string.paywall_period_annual
                    ),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                )
                if (option == BillingPeriod.ANNUAL) {
                    Text(
                        text = stringResource(Res.string.paywall_annual_badge, Pricing.annualMonthsFree),
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
private fun PlanCard(
    plan: PlanId,
    period: BillingPeriod,
    currency: Currency,
    selected: Boolean,
    isCurrent: Boolean,
    onSelect: () -> Unit
) {
    val colors = MaterialTheme.colorScheme
    val recommended = plan == Pricing.RECOMMENDED_PLAN
    // The recommended plan is the one inverted card on the page — the eye lands there first.
    val container = if (recommended) colors.onBackground else colors.surfaceVariant
    val content = if (recommended) colors.background else colors.onBackground
    val muted = content.copy(alpha = 0.7f)
    val borderColor = if (selected) colors.onBackground else colors.surfaceVariant

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .border(BorderStroke(if (selected) 2.dp else 1.dp, borderColor), RoundedCornerShape(20.dp))
            .background(container)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .padding(20.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(planName(plan)),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = content
            )
            Spacer(Modifier.weight(1f))
            if (recommended) {
                Text(
                    text = stringResource(Res.string.paywall_badge_recommended),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.onBackground,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(colors.background)
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                )
            } else if (isCurrent) {
                Text(
                    text = stringResource(Res.string.paywall_cta_current),
                    style = MaterialTheme.typography.labelMedium,
                    color = muted
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(text = stringResource(outcomeFor(plan)), style = MaterialTheme.typography.bodyMedium, color = muted)

        Spacer(Modifier.height(14.dp))
        PriceBlock(plan, period, currency, content, muted)

        Spacer(Modifier.height(14.dp))
        bulletsFor(plan).forEach { bullet ->
            Row(modifier = Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = content, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (bullet == Res.string.paywall_free_bullet_1) {
                        stringResource(bullet, Pricing.FREE_DRILLS_PER_MONTH)
                    } else {
                        stringResource(bullet)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = content
                )
            }
        }
    }
}

@Composable
private fun PriceBlock(
    plan: PlanId,
    period: BillingPeriod,
    currency: Currency,
    content: androidx.compose.ui.graphics.Color,
    muted: androidx.compose.ui.graphics.Color
) {
    val perMonth = Pricing.monthlyEquivalent(plan, period, currency)
    Text(
        text = stringResource(Res.string.paywall_price_per_month, perMonth.format()),
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        color = content
    )
    if (plan != PlanId.FREE && period == BillingPeriod.ANNUAL) {
        Text(
            text = stringResource(Res.string.paywall_billed_annually_short, Pricing.price(plan, period, currency).format()),
            style = MaterialTheme.typography.labelMedium,
            color = muted
        )
    }
}

private fun outcomeFor(plan: PlanId) = when (plan) {
    PlanId.FREE -> Res.string.paywall_free_outcome
    PlanId.PLUS -> Res.string.paywall_plus_outcome
    PlanId.PRO -> Res.string.paywall_pro_outcome
}

private fun bulletsFor(plan: PlanId) = when (plan) {
    PlanId.FREE -> listOf(Res.string.paywall_free_bullet_1, Res.string.paywall_free_bullet_2, Res.string.paywall_free_bullet_3)
    PlanId.PLUS -> listOf(Res.string.paywall_plus_bullet_1, Res.string.paywall_plus_bullet_2, Res.string.paywall_plus_bullet_3)
    PlanId.PRO -> listOf(Res.string.paywall_pro_bullet_1, Res.string.paywall_pro_bullet_2, Res.string.paywall_pro_bullet_3)
}

@Composable
private fun PaywallBottomBar(
    state: PaywallUiState,
    entitlement: Entitlement,
    currency: Currency,
    startsWithTrial: Boolean,
    onContinue: () -> Unit
) {
    val plan = state.selectedPlan
    val isCurrent = entitlement.effectivePlan == plan && plan != PlanId.FREE
    val label = when {
        plan == PlanId.FREE -> stringResource(Res.string.paywall_cta_free)
        isCurrent -> stringResource(Res.string.paywall_cta_current)
        entitlement.hasPaidAccess -> stringResource(Res.string.paywall_cta_switch, stringResource(planName(plan)))
        startsWithTrial -> stringResource(Res.string.paywall_cta_trial, Pricing.PLUS_TRIAL_DAYS)
        else -> stringResource(Res.string.paywall_cta_subscribe, stringResource(planName(plan)))
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 12.dp)
    ) {
        BrightButton(
            text = label,
            onClick = onContinue,
            enabled = !isCurrent,
            loading = state.isWorking && !state.checkoutOpen,
            style = if (plan == PlanId.FREE) BrightButtonStyle.OUTLINED else BrightButtonStyle.FILLED,
            modifier = Modifier.fillMaxWidth()
        )
        if (startsWithTrial && plan == PlanId.PLUS && !isCurrent) {
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(
                    Res.string.paywall_trial_note,
                    Pricing.PLUS_TRIAL_DAYS,
                    periodPrice(plan, state.period, currency)
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

/** "R49/month" or "R490/year"-style recurring price, for trial and checkout copy. */
@Composable
private fun periodPrice(plan: PlanId, period: BillingPeriod, currency: Currency): String {
    val price = Pricing.price(plan, period, currency).format()
    return if (period == BillingPeriod.MONTHLY) {
        stringResource(Res.string.paywall_price_per_month, price)
    } else {
        stringResource(Res.string.paywall_billed_annually, Pricing.monthlyEquivalent(plan, period, currency).format(), price)
    }
}

@Composable
private fun CheckoutSheet(
    state: PaywallUiState,
    currency: Currency,
    startsWithTrial: Boolean,
    dueToday: Money,
    onToggleAddOn: (AddOn) -> Unit,
    onPay: () -> Unit
) {
    val colors = MaterialTheme.colorScheme
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(bottom = 16.dp)
    ) {
        Text(stringResource(Res.string.checkout_title), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Bright ${stringResource(planName(state.selectedPlan))} · " + stringResource(
                    if (state.period == BillingPeriod.MONTHLY) Res.string.paywall_period_monthly else Res.string.paywall_period_annual
                ),
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f)
            )
            Text(
                text = Pricing.price(state.selectedPlan, state.period, currency).format(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold
            )
        }

        val addOns = Pricing.checkoutAddOnsFor(state.selectedPlan)
        if (addOns.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            Text(
                stringResource(Res.string.checkout_addons_title),
                style = MaterialTheme.typography.titleSmall,
                color = colors.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            addOns.forEach { addOn ->
                AddOnRow(
                    addOn = addOn,
                    price = Pricing.addOnPrice(addOn, currency),
                    checked = addOn in state.selectedAddOns,
                    onToggle = { onToggleAddOn(addOn) }
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        HorizontalDivider(color = colors.outline.copy(alpha = 0.3f))
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(Res.string.checkout_due_today), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text(dueToday.format(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        if (startsWithTrial) {
            Text(
                text = stringResource(Res.string.checkout_then, periodPrice(state.selectedPlan, state.period, currency)),
                style = MaterialTheme.typography.labelMedium,
                color = colors.onSurfaceVariant,
                modifier = Modifier.align(Alignment.End)
            )
        }

        Spacer(Modifier.height(16.dp))
        BrightButton(
            text = stringResource(
                if (startsWithTrial && dueToday.minorUnits == 0L) Res.string.checkout_start_trial else Res.string.checkout_pay
            ),
            onClick = onPay,
            loading = state.isWorking,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
fun AddOnRow(addOn: AddOn, price: Money, checked: Boolean, onToggle: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() })
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(checkedColor = colors.onBackground, checkmarkColor = colors.background)
        )
        Spacer(Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(addOnTitle(addOn), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(stringResource(addOnBody(addOn)), style = MaterialTheme.typography.bodySmall, color = colors.onSurfaceVariant)
        }
        Text("+${price.format()}", style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
fun addOnTitle(addOn: AddOn): String = when (addOn) {
    AddOn.DRILL_PACK -> stringResource(Res.string.addon_drill_pack_title, Pricing.DRILL_PACK_SIZE)
    AddOn.STREAK_FREEZES -> stringResource(Res.string.addon_streak_freezes_title, Pricing.STREAK_FREEZE_PACK_SIZE)
}

private fun addOnBody(addOn: AddOn) = when (addOn) {
    AddOn.DRILL_PACK -> Res.string.addon_drill_pack_body
    AddOn.STREAK_FREEZES -> Res.string.addon_streak_freezes_body
}
