package com.bright.shared

/**
 * Scaffolding for the KMP migration (Phase 1) — deliberately trivial.
 *
 * Its only job right now is to prove the three source sets are real and wired: that
 * `commonMain` compiles for both Android and iOS, and that each platform supplies its own
 * `actual`. Real logic starts moving into `commonMain` in Phase 2 (see IOS_MIGRATION_PLAN.md).
 */
expect fun platformName(): String
