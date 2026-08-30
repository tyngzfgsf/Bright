import SwiftUI
import Shared

/// Bridges the Kotlin-side Compose UI (see shared/.../MainViewController.kt) into SwiftUI.
/// `MainViewControllerKt` is the Objective-C class Kotlin/Native generates for a top-level
/// function in MainViewController.kt.
struct ComposeView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        MainViewControllerKt.MainViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

@main
struct iOSApp: App {
    var body: some Scene {
        WindowGroup {
            // Compose draws edge-to-edge and applies its own insets via safeDrawingPadding(),
            // so SwiftUI hands it the full window. The keyboard is deliberately NOT ignored,
            // so the text field stays visible when the IME appears.
            ComposeView()
                .ignoresSafeArea(.container)
        }
    }
}
