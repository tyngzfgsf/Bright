#!/usr/bin/env bash
# Fails if any localized strings.xml has a different set of resource names than values/.
# Run from anywhere; used by CI and by the Claude Code PostToolUse hook.
set -euo pipefail
cd "$(dirname "$0")/.."

res=shared/src/commonMain/composeResources
base="$res/values/strings.xml"
keys() { grep -oE 'name="[^"]+"' "$1" | sort; }

status=0
dupes=$(keys "$base" | uniq -d)
if [ -n "$dupes" ]; then
    echo "Duplicate keys in $base:"; echo "$dupes" | sed 's/^/  /'; status=1
fi
for f in "$res"/values-*/strings.xml; do
    missing=$(comm -23 <(keys "$base") <(keys "$f"))
    extra=$(comm -13 <(keys "$base") <(keys "$f"))
    if [ -n "$missing" ]; then
        echo "Missing from $f:"; echo "$missing" | sed 's/^/  /'; status=1
    fi
    if [ -n "$extra" ]; then
        echo "In $f but not in $base:"; echo "$extra" | sed 's/^/  /'; status=1
    fi
done
[ $status -eq 0 ] && echo "strings.xml keys in sync across all locales."
exit $status
