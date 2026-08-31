package com.bright.app.util

import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Random identifier for sessions and messages, replacing `java.util.UUID.randomUUID()` — the
 * only JVM-only dependency the ViewModels had.
 *
 * `@OptIn` here rather than propagating `@ExperimentalUuidApi` to callers: the bare marker
 * would force every caller to opt in too (see gotcha #2 in CLAUDE.md), and this one function
 * is the whole surface area, so containing it here keeps the experimental status invisible
 * to the rest of the app.
 */
@OptIn(ExperimentalUuidApi::class)
fun randomId(): String = Uuid.random().toString()
