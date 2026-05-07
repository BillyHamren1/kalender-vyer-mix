#!/usr/bin/env bash
# Thin wrapper — delegates to the Python implementation (perl is not always
# installed in CI/sandbox environments).
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "${DIR}/check-time-engine-clean.py" "$@"
