package com.bright.app.ui.onboarding

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import org.jetbrains.compose.resources.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.LocalBrightDependencies
import com.bright.app.data.analytics.AnalyticsEvent
import com.bright.app.resources.Res
import com.bright.app.resources.*
import com.bright.app.domain.model.Language
import com.bright.app.domain.billing.Pricing
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightButtonStyle
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip
import kotlinx.coroutines.launch

@Composable
fun OnboardingScreen(
    /** The first session's id when the trainee chose to start one, else null. */
    onFinished: (String?) -> Unit
) {
    val app = LocalBrightDependencies.current
    val viewModel: OnboardingViewModel = viewModel(
        factory = viewModelFactory {
            initializer { OnboardingViewModel(app.userPreferences, app.analytics, app.database.chatDao(), app.authService) }
        }
    )

    var introFinished by rememberSaveable { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        if (!introFinished) {
            CinematicIntro(onFinished = { introFinished = true })
        } else {
            OnboardingPager(viewModel = viewModel, onFinished = onFinished)
        }
    }
}

@Composable
private fun CinematicIntro(onFinished: () -> Unit) {
    val titleAlpha = remember { Animatable(0f) }
    val titleScale = remember { Animatable(0.85f) }
    val sloganAlpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        titleAlpha.animateTo(1f, animationSpec = tween(700, easing = LinearOutSlowInEasing))
    }
    LaunchedEffect(Unit) {
        titleScale.animateTo(1f, animationSpec = tween(700, easing = LinearOutSlowInEasing))
    }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(500)
        sloganAlpha.animateTo(1f, animationSpec = tween(500))
        kotlinx.coroutines.delay(1300)
        onFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { onFinished() },
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(Res.string.app_name),
                style = MaterialTheme.typography.displayLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.graphicsLayer {
                    alpha = titleAlpha.value
                    scaleX = titleScale.value
                    scaleY = titleScale.value
                }
            )
            Spacer(Modifier.height(12.dp))
            Text(
                text = stringResource(Res.string.app_slogan),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.graphicsLayer { alpha = sloganAlpha.value }
            )
        }
    }
}

private enum class PageKind { LANGUAGE, ACCOUNT, FIRST_CASE }

@Composable
private fun OnboardingPager(viewModel: OnboardingViewModel, onFinished: (String?) -> Unit) {
    val pages = remember { listOf(PageKind.LANGUAGE, PageKind.ACCOUNT, PageKind.FIRST_CASE) }
    val pagerState = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val selectedLanguage by viewModel.selectedLanguage.collectAsState()
    val currentUser by viewModel.currentUser.collectAsState()
    val isSigningIn by viewModel.isSigningIn.collectAsState()
    val signInError by viewModel.signInError.collectAsState()
    var apiKeyInput by rememberSaveable { mutableStateOf("") }
    var showKeyField by rememberSaveable { mutableStateOf(!viewModel.canSignIn) }
    // Guards a double tap on the finishing buttons while the prefs writes are in flight.
    var finishing by remember { mutableStateOf(false) }

    val hasKey = apiKeyInput.isNotBlank()
    val isConnected = hasKey || currentUser != null

    LaunchedEffect(pagerState.currentPage) {
        viewModel.logStep(
            when (pages[pagerState.currentPage]) {
                PageKind.LANGUAGE -> AnalyticsEvent.OnboardingStep.LANGUAGE
                PageKind.ACCOUNT -> AnalyticsEvent.OnboardingStep.KEY_ENTRY
                PageKind.FIRST_CASE -> AnalyticsEvent.OnboardingStep.FIRST_CASE_OFFERED
            }
        )
    }

    fun finish(startFirstCase: Boolean) {
        if (finishing) return
        finishing = true
        viewModel.logStep(if (hasKey) AnalyticsEvent.OnboardingStep.KEY_SAVED else AnalyticsEvent.OnboardingStep.KEY_SKIPPED)
        scope.launch {
            // Starting a case needs a way to run it; signing in is the zero-setup way.
            val canStart = startFirstCase && (isConnected || viewModel.signIn())
            if (startFirstCase && !canStart) {
                finishing = false
                return@launch
            }
            onFinished(viewModel.finishOnboarding(apiKeyInput, startFirstCase = canStart))
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Spacer(Modifier.height(56.dp))

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.weight(1f).fillMaxWidth()
        ) { pageIndex ->
            when (pages[pageIndex]) {
                PageKind.LANGUAGE -> LanguagePage(
                    selectedLanguage = selectedLanguage,
                    onSelect = { viewModel.selectLanguage(it) }
                )
                PageKind.ACCOUNT -> AccountPage(
                    canSignIn = viewModel.canSignIn,
                    signedInAs = currentUser?.let { it.email ?: it.displayName ?: it.uid },
                    isSigningIn = isSigningIn,
                    signInError = signInError,
                    onSignIn = {
                        scope.launch {
                            if (viewModel.signIn()) pagerState.animateScrollToPage(pages.indexOf(PageKind.FIRST_CASE))
                        }
                    },
                    showKeyField = showKeyField,
                    onShowKeyField = { showKeyField = true },
                    apiKey = apiKeyInput,
                    onApiKeyChange = { apiKeyInput = it }
                )
                PageKind.FIRST_CASE -> FirstCasePage()
            }
        }

        PageIndicator(
            pageCount = pages.size,
            currentPage = pagerState.currentPage,
            modifier = Modifier.padding(vertical = 16.dp).fillMaxWidth()
        )

        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 20.dp)) {
            when (pages[pagerState.currentPage]) {
                PageKind.FIRST_CASE -> {
                    BrightButton(
                        text = stringResource(Res.string.onboarding_first_case_start),
                        loading = finishing || isSigningIn,
                        onClick = { finish(startFirstCase = true) },
                        modifier = Modifier.fillMaxWidth()
                    )
                    TextButton(
                        onClick = { finish(startFirstCase = false) },
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                    ) {
                        Text(stringResource(Res.string.onboarding_first_case_later))
                    }
                }
                else -> {
                    val onAccountPage = pages[pagerState.currentPage] == PageKind.ACCOUNT
                    BrightButton(
                        // Still skippable: drills gate on a key or an account later, not here.
                        text = stringResource(
                            if (onAccountPage && !isConnected) Res.string.onboarding_skip_key else Res.string.onboarding_next
                        ),
                        style = if (onAccountPage && !isConnected) BrightButtonStyle.OUTLINED else BrightButtonStyle.FILLED,
                        onClick = { scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) } },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}

@Composable
private fun LanguagePage(selectedLanguage: Language, onSelect: (Language) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            stringResource(Res.string.onboarding_choose_language_title),
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(Res.string.onboarding_choose_language_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(32.dp))
        Language.entries.forEach { lang ->
            SelectableChip(
                text = lang.displayName,
                selected = selectedLanguage == lang,
                onClick = { onSelect(lang) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
            )
        }
    }
}

@Composable
private fun AccountPage(
    canSignIn: Boolean,
    signedInAs: String?,
    isSigningIn: Boolean,
    signInError: String?,
    onSignIn: () -> Unit,
    showKeyField: Boolean,
    onShowKeyField: () -> Unit,
    apiKey: String,
    onApiKeyChange: (String) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            stringResource(if (canSignIn) Res.string.onboarding_account_title else Res.string.onboarding_api_key_title),
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            if (canSignIn) {
                stringResource(Res.string.onboarding_account_subtitle, Pricing.FREE_DRILLS_PER_MONTH)
            } else {
                stringResource(Res.string.onboarding_api_key_subtitle)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))

        if (canSignIn) {
            if (signedInAs != null) {
                Text(
                    stringResource(Res.string.onboarding_account_signed_in, signedInAs),
                    style = MaterialTheme.typography.titleSmall,
                    textAlign = TextAlign.Center
                )
            } else {
                BrightButton(
                    text = stringResource(Res.string.settings_sign_in),
                    loading = isSigningIn,
                    onClick = onSignIn,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            signInError?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        if (showKeyField) {
            Spacer(Modifier.height(16.dp))
            BrightTextField(
                value = apiKey,
                onValueChange = onApiKeyChange,
                placeholder = stringResource(Res.string.onboarding_api_key_hint),
                isPassword = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(Res.string.onboarding_api_key_get_one),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else if (signedInAs == null) {
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = onShowKeyField) {
                Text(stringResource(Res.string.onboarding_use_own_key))
            }
        }
    }
}

@Composable
private fun FirstCasePage() {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("⏱", style = MaterialTheme.typography.displayMedium)
        Spacer(Modifier.height(16.dp))
        Text(
            stringResource(Res.string.onboarding_first_case_title),
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(Res.string.onboarding_first_case_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun PageIndicator(pageCount: Int, currentPage: Int, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.Center) {
        repeat(pageCount) { index ->
            val isSelected = index == currentPage
            val width by animateDpAsState(
                targetValue = if (isSelected) 22.dp else 8.dp,
                animationSpec = tween(250),
                label = "dotWidth"
            )
            Box(
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .size(width = width, height = 8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(
                        if (isSelected) MaterialTheme.colorScheme.onBackground
                        else MaterialTheme.colorScheme.surfaceVariant
                    )
            )
        }
    }
}
