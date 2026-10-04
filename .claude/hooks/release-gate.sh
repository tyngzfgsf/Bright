#!/usr/bin/env bash
# Enforces "./gradlew clean assembleDebug before tagging" (CLAUDE.md gotcha #1).
#
#   release-gate.sh stamp   record the current working tree as clean-built
#   release-gate.sh record  PostToolUse(Bash): stamp if the command was a successful clean build
#   release-gate.sh gate    PreToolUse(Bash): block `git tag v*` / tag pushes of unbuilt trees
#
# The stamp is a git tree hash of the working tree (tracked + untracked, minus ignored), so it
# survives the usual build -> commit -> tag order and goes stale as soon as any file changes.
set -uo pipefail

mode=${1:-}
if [ "$mode" = stamp ]; then input='{}'; else input=$(cat); fi
cwd=$(jq -r '.cwd // empty' <<< "$input")
cd "${cwd:-${CLAUDE_PROJECT_DIR:-.}}" 2>/dev/null || exit 0
git rev-parse --git-dir > /dev/null 2>&1 || exit 0
stamp_file=$(git rev-parse --git-path bright-clean-build)

worktree_tree() {
    local idx; idx=$(mktemp)
    cp "$(git rev-parse --git-path index)" "$idx" 2>/dev/null
    GIT_INDEX_FILE=$idx git add -A > /dev/null 2>&1
    GIT_INDEX_FILE=$idx git write-tree
    rm -f "$idx"
}

block() {
    echo "Release gate: $1" >&2
    echo "Run scripts/clean-build.sh (or ./gradlew clean assembleDebug) on exactly this tree first — incremental builds can hide compile errors that CI's clean checkout catches." >&2
    exit 2
}

cmd=$(jq -r '.tool_input.command // empty' <<< "$input")
git_re='(^|[;&|(] *)git( +-C +[^ ]+)?'

case "$mode" in
stamp)
    worktree_tree > "$stamp_file" && echo "Clean build stamped: $(cat "$stamp_file")"
    ;;
record)
    grep -q 'gradlew' <<< "$cmd" && grep -Eq '(^| )clean( |$)' <<< "$cmd" \
        && grep -q 'assemble' <<< "$cmd" || exit 0
    jq -r '.tool_response | tostring' <<< "$input" | grep -q 'BUILD SUCCESSFUL' || exit 0
    worktree_tree > "$stamp_file"
    ;;
gate)
    built=$(cat "$stamp_file" 2>/dev/null)
    if grep -Eq "$git_re +tag( +[^ ]+)* +v[0-9]" <<< "$cmd" \
        && ! grep -Eq "$git_re +tag +(-l|--list|-d|--delete)( |$)" <<< "$cmd"; then
        [ -n "$built" ] || block "no clean build recorded in this checkout."
        [ "$(worktree_tree)" = "$built" ] || block "files changed since the last clean build."
    fi
    if grep -Eq "$git_re +push( |$)" <<< "$cmd"; then
        tags=$(grep -oE "$git_re +push( +[^ ;&|]+)*" <<< "$cmd" | grep -oE '(refs/tags/)?v[0-9][^ :]*' | sed 's#^refs/tags/##')
        if grep -Eq "$git_re +push( +[^ ]+)* +--tags( |$)" <<< "$cmd"; then
            tags="$tags $(git tag -l 'v[0-9]*' --sort=-v:refname | head -1)"
        fi
        for t in $tags; do
            tree=$(git rev-parse -q --verify "$t^{tree}") || continue
            [ -n "$built" ] || block "no clean build recorded before pushing tag $t."
            [ "$tree" = "$built" ] || block "tag $t points at a tree that wasn't clean-built."
        done
    fi
    ;;
esac
exit 0
