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

if __name__ == '__main__':
    try:
        accepted = validate(Path(sys.argv[1]).read_text())
    except Exception:
        raise SystemExit('Native drilldown evidence rejected; no partial proof emitted')
    for row in accepted:
        print(row)
