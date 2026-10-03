#!/usr/bin/env bash
set -euo pipefail

expected_head=${EVENTFLOW_EXPECTED_SOURCE_HEAD:?exact expected source head required}
case "$expected_head" in
  (*[!0-9a-f]*|'')
    printf '%s\n' 'operations-exact-source FAIL invalid_expected_head' >&2
    exit 1
    ;;
esac
test "${#expected_head}" -eq 40

actual_head=$(git rev-parse --verify HEAD)
test "$actual_head" = "$expected_head"
expected_tree=$(git rev-parse --verify "${expected_head}^{tree}")
actual_tree=$(git rev-parse --verify 'HEAD^{tree}')
test "$actual_tree" = "$expected_tree"
git diff --no-ext-diff --ignore-submodules=all --exit-code --
git diff --cached --no-ext-diff --ignore-submodules=all --exit-code --
test -z "$(git status --porcelain --untracked-files=normal)"
printf 'operations-exact-source PASS head=%s tree=%s\n' "$actual_head" "$actual_tree"
