"""Validate the complete private journey before emitting fixed public evidence."""
import json
from pathlib import Path
import sys

CASES = (
    'copied Catering and persistent opaque withdrawal',
    'missing cost remains null',
    'exact saved manual scope and no forecast',
    'no exact scope gives no child fallback',
    'grant required',
    'accepted actual scoped grant',
    'actual exact receipt revoke and denied reread',
    'foreign signed actor cannot read source organization',
    'wrong actual profile organization selector',
    'missing or nonexistent authenticated actor',
    'signature really verified',
    'live organization change invalidates old tuple',
    'deleted live root denied',
    'live administrator revoke denied',
    'no cost evidence written by reads or fixture identity controls',
)
SCOPE = 'native signed fixture JWT/PostgREST authorization; received evidence only'

def validate(raw):
    rows = raw.splitlines()
    if len(rows) != 16:
        raise ValueError('Exact complete native evidence required')
    values = [json.loads(row) for row in rows]
    for value, case in zip(values[:15], CASES):
        if value != {'case': case, 'result': 'PASS'}:
            raise ValueError('Unexpected case, result, order or private fields')
    if values[-1] != {'result': 'PASS', 'cases': 15, 'scope': SCOPE}:
        raise ValueError('Exact native completion required')
    return [json.dumps(v, sort_keys=True) for v in values]

if __name__ == '__main__':
    try:
        accepted = validate(Path(sys.argv[1]).read_text())
    except Exception:
        raise SystemExit('Native authenticated evidence rejected; no partial proof emitted')
    for row in accepted:
        print(row)
