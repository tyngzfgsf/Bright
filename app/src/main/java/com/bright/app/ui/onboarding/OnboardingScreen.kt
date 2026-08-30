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
import androidx.compose.ui.platform.LocalContext
import org.jetbrains.compose.resources.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.bright.app.BrightApplication
import com.bright.app.resources.Res
import com.bright.app.resources.*
import com.bright.app.domain.model.Language
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip
import kotlinx.coroutines.launch

@Composable
fun OnboardingScreen(onFinished: () -> Unit) {
    val app = LocalContext.current.applicationContext as BrightApplication
    val viewModel: OnboardingViewModel = viewModel(
        factory = viewModelFactory { initializer { OnboardingViewModel(app.userPreferences) } }
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

private enum class PageKind { LANGUAGE, API_KEY }

@Composable
private fun OnboardingPager(viewModel: OnboardingViewModel, onFinished: () -> Unit) {
    val pages = remember { listOf(PageKind.LANGUAGE, PageKind.API_KEY) }
    val pagerState = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val selectedLanguage by viewModel.selectedLanguage.collectAsState()
    var apiKeyInput by rememberSaveable { mutableStateOf("") }

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
                PageKind.API_KEY -> ApiKeyPage(
                    value = apiKeyInput,
                    onValueChange = { apiKeyInput = it }
                )
            }
        }

        PageIndicator(
            pageCount = pages.size,
            currentPage = pagerState.currentPage,
            modifier = Modifier.padding(vertical = 16.dp).fillMaxWidth()
        )

        Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 20.dp)) {
            val isLastPage = pagerState.currentPage == pages.lastIndex
            val hasKey = apiKeyInput.isNotBlank()
            BrightButton(
                // The key is genuinely optional here — sessions gate on it later, with a dialog
                // offering to jump to Settings. The button used to be hard-disabled until 8+
                // characters were typed, which made it a wall rather than a skippable step.
                text = stringResource(
                    when {
                        !isLastPage -> Res.string.onboarding_next
                        hasKey -> Res.string.onboarding_get_started
                        else -> Res.string.onboarding_skip_key
                    }
                ),
                onClick = {
                    if (isLastPage) {
                        if (hasKey) viewModel.saveApiKey(apiKeyInput)
                        viewModel.completeOnboarding()
                        onFinished()
                    } else {
                        scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
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
private fun ApiKeyPage(value: String, onValueChange: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            stringResource(Res.string.onboarding_api_key_title),
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(Res.string.onboarding_api_key_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))
        BrightTextField(
            value = value,
            onValueChange = onValueChange,
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
