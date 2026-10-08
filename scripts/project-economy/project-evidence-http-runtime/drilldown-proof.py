"""All fixed native drilldown results must validate before any public proof."""
import json
from pathlib import Path
import sys

CASES = (
    'drilldown project root copied individual invoice',
    'drilldown large root copied individual invoice',
    'drilldown packing root copied individual invoice',
    'drilldown unavailable categories and null prognosis',
    'drilldown changed baseline preserves saved amount and null sources',
    'drilldown superseded displayed composition returns PT409',
    'drilldown actual membership change returns PT409',
    'drilldown unselected obligation returns PT409',
    'drilldown caller actor field is rejected',
    'drilldown foreign live profile actor denied',
    'drilldown actual project grant does not confer scope admin',
    'drilldown signed missing actor denied',
    'drilldown HS256 signature genuinely checked',
    'drilldown live profile org change invalidates old tuple',
    'drilldown live packing status policy revoke denied',
    'drilldown deleted actual project root denied',
    'drilldown revoked live administrator denied',
    'drilldown reads and metadata controls preserve evidence ledgers',
)
SCOPE = 'native signed fixture JWT/PostgREST one-obligation authorization; received evidence only'

def validate(raw):
    rows = raw.splitlines()
    if len(rows) != 19:
        raise ValueError('Complete exact native drilldown proof required')
    values = [json.loads(row) for row in rows]
    for value, case in zip(values[:18], CASES):
        if value != {'case': case, 'result': 'PASS'}:
            raise ValueError('Unexpected case order, result or private field')
    if values[-1] != {'result': 'PASS', 'cases': 18, 'scope': SCOPE}:
        raise ValueError('Exact native drilldown completion required')
    return [json.dumps(value, sort_keys=True) for value in values]


def failure(raw):
    """Emit only a fixed failed boundary; this never accepts partial proof."""
    rows = [json.loads(row) for row in raw.splitlines()]
    if not 1 <= len(rows) <= 19:
        raise ValueError('Closed failure evidence required')
    for value, case in zip(rows[:-1], CASES):
        if value != {'case': case, 'result': 'PASS'}:
            raise ValueError('Exact prior boundary required')
    last = rows[-1]
    allowed = set(CASES) | {'drilldown isolated guard'}
    if set(last) != {'case', 'result', 'reason'} or last['case'] not in allowed or last['result'] != 'FAIL' or last['reason'] != 'authenticated drilldown proof failed':
        raise ValueError('Fixed failure required')
    return json.dumps({'result': 'FAIL', 'boundary': last['case'], 'accepted': False, 'prior_boundaries': len(rows) - 1}, sort_keys=True)

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--failure':
        try:
            print(failure(Path(sys.argv[2]).read_text()))
        except Exception:
            print('Native drilldown failed; closed boundary unavailable; no acceptance')
        raise SystemExit(0)
    try:
        accepted = validate(Path(sys.argv[1]).read_text())
    except Exception:
        raise SystemExit('Native drilldown evidence rejected; no partial proof emitted')
    for row in accepted:
        print(row)
