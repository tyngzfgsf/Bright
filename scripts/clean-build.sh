#!/usr/bin/env bash
# Runs the release-grade clean build and, on success, stamps the exact source tree it built.
# The Claude Code release gate (.claude/hooks/release-gate.sh) refuses to tag unless the tree
# being tagged matches this stamp — see CLAUDE.md gotcha #1.
set -euo pipefail
cd "$(dirname "$0")/.."
./gradlew clean assembleDebug "$@"
.claude/hooks/release-gate.sh stamp
