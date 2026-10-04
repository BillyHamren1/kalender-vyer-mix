"""Verify the exact three Finance production files before native allocation proof."""
import hashlib
import json
from pathlib import Path

root=Path(__file__).absolute().parents[2]
directory=root/'scripts/project-economy/catering-allocation-native-counterparts'
finance=directory/'finance'
if directory.resolve()!=directory or finance.resolve()!=finance or not finance.is_dir():raise SystemExit('Redirected Finance proof source denied')
manifest=json.loads((directory/'source-manifest.json').read_text())
if set(manifest)!={'schema','repository','commit','files'} or manifest['schema']!='catering-allocation-native-finance-source.v1' or manifest['repository']!='BillyHamren1/eventflow-finance' or manifest['commit']!='dcd53831ffee6f5963ab0828b838a9760f66da8f':raise SystemExit('Exact reviewed Finance source version required')
required={'src/domain/cateringProjectAllocationDelivery.ts','src/domain/cateringProjectDelivery.ts','src/domain/cateringProjectEvidence.ts'}
if len(manifest['files'])!=3 or {v['path'] for v in manifest['files']}!=required:raise SystemExit('Exactly three actual production Finance files required')
for row in manifest['files']:
    if set(row)!={'path','git_sha1','sha256','bytes'}:raise SystemExit('Exact Finance source proof fields required')
    path=finance/row['path']
    if not path.is_file() or path.resolve()!=path:raise SystemExit('Redirected actual Finance file denied')
    data=path.read_bytes()
    if len(data)!=row['bytes'] or hashlib.sha256(data).hexdigest()!=row['sha256'] or hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()!=row['git_sha1']:raise SystemExit('Actual Finance source bytes mismatch')
actual=set()
for path in finance.rglob('*'):
    if path.is_symlink():raise SystemExit('Finance source symlink denied')
    if path.is_file():actual.add(path.relative_to(finance).as_posix())
if actual!=required:raise SystemExit('Unreviewed extra Finance source denied')
print('PASS exact Finance dcd538 three production modules; SQL runtime proof still required')
