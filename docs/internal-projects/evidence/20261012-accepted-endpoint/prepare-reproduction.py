"""Materialize pinned dependencies from authorized local Git checkouts outside either repository."""
import argparse, hashlib, json, pathlib, shutil, subprocess
p=argparse.ArgumentParser();p.add_argument('--operations-repo',required=True);p.add_argument('--finance-repo',required=True);p.add_argument('--time-repo',required=True);p.add_argument('--output',required=True);a=p.parse_args()
archive=pathlib.Path(__file__).resolve().parent
repos={'BillyHamren1/kalender-vyer-mix':pathlib.Path(a.operations_repo).resolve(),'BillyHamren1/eventflow-finance':pathlib.Path(a.finance_repo).resolve(),'BillyHamren1/eventflow-time':pathlib.Path(a.time_repo).resolve()}
out=pathlib.Path(a.output).resolve()
if out.exists() or any(out==r or r in out.parents for r in [archive,*repos.values()]):raise SystemExit('Use a new disposable output directory outside all source repositories.')
manifest=json.loads((archive/'DEPENDENCY_BLOBS.json').read_text())
def read_pinned(f):
 b=subprocess.check_output(['git','-C',str(repos[f['repository']]),'show',f['commit']+':'+f['path']])
 if hashlib.sha256(b).hexdigest()!=f['sha256']:raise SystemExit('SHA256 mismatch: '+f['path'])
 if hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!=f['git_blob']:raise SystemExit('Git blob mismatch: '+f['path'])
 return b
# Read/verify every genuine object before any materialization. No network/auth calls.
objects=[(f,read_pinned(f)) for f in manifest['files']];invoice=read_pinned(manifest['invoice_dependency'])
for f,b in objects:
 target=out/f['root']/f['path'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
harness=out/'harness';harness.mkdir()
for source in archive.glob('*.mjs'):shutil.copyfile(source,harness/source.name)
target=harness/'invoice-sources'/pathlib.Path(manifest['invoice_dependency']['path']).name;target.parent.mkdir();target.write_bytes(invoice)
(out/'operations'/'package.json').write_text('{"private":true,"type":"module"}\n')
print(out)
print('Dependencies verified: 65 source files plus the separately pinned genuine invoice DDL.')
