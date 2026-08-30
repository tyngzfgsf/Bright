package com.bright.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import platform.UIKit.UIScreen
import platform.UIKit.UIUserInterfaceStyle

@Composable
internal actual fun isSystemInDarkThemeMultiplatform(): Boolean =
    UIScreen.mainScreen.traitCollection.userInterfaceStyle == UIUserInterfaceStyle.UIUserInterfaceStyleDark

/**
 * Intentional no-op, not an unimplemented stub. iOS status bar appearance is owned by the
 * hosting UIViewController (via preferredStatusBarStyle / Info.plist), not by the Compose
 * layer, so there is nothing meaningful for a shared theme to set here. The equivalent
 * configuration belongs in the iOS app shell in Phase 6.
 */
@Composable
internal actual fun SystemBarsEffect(darkTheme: Boolean, background: Color) {
    // no-op — see KDoc above
}
