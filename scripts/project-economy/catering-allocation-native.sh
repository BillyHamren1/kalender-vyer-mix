#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ ${CI:-} == true && ${OPERATIONS_CATERING_ALLOCATION_ISOLATED:-} == 1 ]] || { echo 'Dedicated disposable native CI required' >&2;exit 2; }
[[ -n ${TEST_DATABASE_URL:-} && -n ${CATERING_ALLOCATION_FINANCE_SOURCE_ROOT:-} ]] || { echo 'Explicit database URL and pinned Finance source root required' >&2;exit 2; }
task_allocation_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
exec python3 "$task_allocation_root/scripts/project-economy/catering-allocation-native.py" --root "$task_allocation_root" --finance-root "$CATERING_ALLOCATION_FINANCE_SOURCE_ROOT"
