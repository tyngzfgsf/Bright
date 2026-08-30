package com.bright.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.ComposeUIViewController
import com.bright.app.domain.model.Language
import com.bright.app.domain.model.ScenarioType
import com.bright.app.domain.model.currentSystemLanguageCode
import com.bright.app.ui.components.BrightButton
import com.bright.app.ui.components.BrightTextField
import com.bright.app.ui.components.SelectableChip
import com.bright.app.ui.theme.BrightTheme
import platform.UIKit.UIViewController

/**
 * The iOS app's Compose entry point, called from Swift (see `iosApp/`).
 *
 * This is deliberately a **validation harness, not the real app** — Bright's actual screens
 * can't move to `commonMain` until the resources and ViewModel-construction gates described
 * under Phase 5 in IOS_MIGRATION_PLAN.md are resolved. What it renders is chosen to exercise
 * as much of the shared stack as possible on a real device: the shared theme (colours,
 * typography, dark-mode `actual`), three shared design-system components, and shared domain
 * types + the `currentSystemLanguageCode` expect/actual from Phase 2.
 */
fun MainViewController(): UIViewController = ComposeUIViewController {
    BrightTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            SharedStackDemo()
        }
    }
}

@Composable
private fun SharedStackDemo() {
    var selected by remember { mutableStateOf(ScenarioType.CARDIAC_ARREST) }
    var customScenario by remember { mutableStateOf("") }
    var tapCount by remember { mutableStateOf(0) }

    val systemLanguage = remember { currentSystemLanguageCode() }
    val resolvedLanguage = remember { Language.fromSystemDefault() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        Text(
            text = "Bright — shared stack on iOS",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Compose Multiplatform rendering commonMain code",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(20.dp))
        Text("Shared domain + expect/actual", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(
            text = "System language code: $systemLanguage\n" +
                "Resolved app language: ${resolvedLanguage.displayName} (${resolvedLanguage.code})\n" +
                "Prompt keyword: ${selected.promptKeyword}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(20.dp))
        Text("SelectableChip (shared)", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ScenarioType.entries.forEach { scenario ->
                SelectableChip(
                    // Display names live in Android resources, which don't exist here — this is
                    // the Phase 5 resources gate, visible. promptKeyword is shared, so it's what
                    // a shared screen can actually show today.
                    text = scenario.promptKeyword,
                    selected = selected == scenario,
                    onClick = { selected = scenario }
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        Text("BrightTextField (shared)", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        BrightTextField(
            value = customScenario,
            onValueChange = { customScenario = it },
            placeholder = "Type to check IME + state…",
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(20.dp))
        BrightButton(
            text = if (tapCount == 0) "Tap to test press animation" else "Tapped $tapCount×",
            onClick = { tapCount++ },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(24.dp))
    }
}
