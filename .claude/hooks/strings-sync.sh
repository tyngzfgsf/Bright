#!/usr/bin/env bash
# PostToolUse(Edit|Write): after any strings.xml edit, check every locale still has the same keys.
# Exit 2 feeds the mismatch back to Claude so it updates the other language in the same pass.
path=$(jq -r '.tool_input.file_path // empty')
case "$path" in */composeResources/values*/strings.xml) ;; *) exit 0 ;; esac
out=$("$CLAUDE_PROJECT_DIR"/scripts/check-strings.sh 2>&1) && exit 0
echo "$out" >&2
echo "Update values/ and values-ko/ strings.xml together so they stay in sync." >&2
exit 2
