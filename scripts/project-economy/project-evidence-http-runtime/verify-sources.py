"""Own repository closure only: no unpinned foreign source or symlink redirect."""
import hashlib
import json
from pathlib import Path
import sys

runtime=Path(__file__).absolute().parent
root=runtime.parents[2]
sys.path.insert(0,str(runtime))
from isolation import validate_paths
validate_paths(root,runtime)
manifest=json.loads((runtime/'source-manifest.json').read_text())
if set(manifest)!={'schema','canonical_baseline_commit','files'} or manifest['schema']!='operations-project-evidence-http-source-closure.v1' or manifest['canonical_baseline_commit']!='b059d3a1841618d84443d27c02509fcafde547fb':
    raise SystemExit('Exact native source manifest required')
seen=set()
for row in manifest['files']:
    if set(row)!={'path','sha256','bytes'} or row['path'] in seen:
        raise SystemExit('Exact distinct native source required')
    path=root/row['path']
    if not path.is_file() or path.resolve()!=path or not path.is_relative_to(root):raise SystemExit('Redirected source denied')
    data=path.read_bytes()
    if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256']:raise SystemExit('Source byte mismatch')
    seen.add(row['path'])
closure=json.loads((runtime/'schema-closure.json').read_text())
if set(closure)!={'schema','database','canonical_baseline_commit','ordered_paths'} or closure['schema']!='operations-project-evidence-http-schema-closure.v1' or closure['database']!='eventflow_project_evidence_http_runtime' or closure['canonical_baseline_commit']!=manifest['canonical_baseline_commit']:
    raise SystemExit('Wrong schema closure')
if len(closure['ordered_paths'])!=19 or len(set(closure['ordered_paths']))!=19 or not set(closure['ordered_paths']).issubset(seen):raise SystemExit('Incomplete selected schema closure')
expected_runtime={p.relative_to(root).as_posix() for p in runtime.iterdir() if p.is_file() and p.name!='source-manifest.json'}
if not expected_runtime.issubset(seen):raise SystemExit('Unreviewed runtime source')
print('PASS exact canonical Operations selected HTTP source bytes and named schema closure')
