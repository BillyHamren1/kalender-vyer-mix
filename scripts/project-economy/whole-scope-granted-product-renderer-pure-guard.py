#!/usr/bin/env python3
"""Pre-code finite local source guard. No subprocess, Docker, database or network."""
import hashlib,json,os,pathlib,stat,sys,time
HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
MANIFEST='scripts/project-economy/whole-scope-granted-product-renderer-pure-closure.json'
PATHS=(
 'scripts/project-economy/whole-scope-granted-product-renderer-pure-crosswire.deno-test.ts',
 'scripts/project-economy/whole-scope-granted-product-renderer-pure-golden.json',
 'supabase/functions/_shared/local-invoice-obligation-kernel-evidence.ts',
 'supabase/functions/_shared/project-cost-obligations.ts',
 'supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts',
 'supabase/functions/_shared/whole-scope-grant-publication-successor-command-v2.ts',
 'supabase/functions/_shared/whole-scope-granted-product-destination-renderer-v1.deno-test.ts',
 'supabase/functions/_shared/whole-scope-granted-product-destination-renderer-v1.ts',
 'supabase/functions/_shared/whole-scope-product-grant-command-v1.ts',
 'supabase/functions/_shared/whole-scope-product-grant-event-v1.ts',
 'supabase/functions/_shared/whole-scope-product-source-proof.ts',
)
CANDIDATES={p for p in PATHS if 'granted-product-renderer-pure-' in p or 'granted-product-destination-renderer-v1' in p}
FIXED={'CI':'true','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','EVENTFLOW_WHOLE_SCOPE_RENDERER_PURE_ISOLATED':'true'}
class Failure(Exception):
 def __init__(self,phase):self.phase=phase if phase in {'environment','manifest','source'} else 'source';super().__init__('closed_renderer_pure_failure')
def environment(env):
 if any(env.get(k)!=v for k,v in FIXED.items()):raise Failure('environment')
 prefixes=('PG','PGRST_','SUPABASE_','DOCKER_','COMPOSE_','LD_','DYLD_','BASH_FUNC_','DENO_','PYTHON')
 names={'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','DATABASE_URL','SUPABASE_URL','GITHUB_TOKEN','NODE_OPTIONS','BASH_ENV','ENV','SHELLOPTS','BASHOPTS','PS4','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES'}
 for key,value in env.items():
  if not value:continue
  if key=='PYTHONDONTWRITEBYTECODE' and value=='1':continue
  if key.startswith('EVENTFLOW_') and key not in FIXED:raise Failure('environment')
  if key.upper() in names or key.startswith(prefixes):raise Failure('environment')
def identity(s):return (s.st_dev,s.st_ino,s.st_uid,s.st_mode,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read_owned(root,relative,limit,expected_size=None):
 """Anchored no-follow directory traversal; bounded regular FD with post-identity."""
 deadline=time.monotonic()+5
 def timely():
  if time.monotonic()>=deadline:raise Failure('source')
 timely();parts=pathlib.PurePosixPath(relative).parts
 if not parts or relative!=str(pathlib.PurePosixPath(relative)) or pathlib.PurePosixPath(relative).is_absolute() or any(p in {'.','..'} for p in parts):raise Failure('source')
 root=pathlib.Path(root).absolute();fds=[];dirs=[]
 try:
  if root.resolve()!=root or root.is_symlink():raise Failure('source')
  timely();root_stat=root.lstat();fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);fds.append(fd)
  if identity(os.fstat(fd))!=identity(root_stat) or root_stat.st_uid!=os.getuid():raise Failure('source')
  dirs.append((root,fd,root_stat))
  for part in parts[:-1]:
   timely();path=dirs[-1][0]/part;st=path.lstat();fd=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd);fds.append(fd)
   if identity(os.fstat(fd))!=identity(st) or st.st_uid!=os.getuid():raise Failure('source')
   dirs.append((path,fd,st))
  timely();before=os.stat(parts[-1],dir_fd=fd,follow_symlinks=False)
  leaf=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd);fds.append(leaf);opened=os.fstat(leaf)
  if identity(opened)!=identity(before) or not stat.S_ISREG(opened.st_mode) or opened.st_uid!=os.getuid() or opened.st_nlink!=1 or opened.st_mode&0o022 or opened.st_size>limit or (expected_size is not None and opened.st_size!=expected_size):raise Failure('source')
  chunks=[];total=0
  for _ in range((limit//4096)+2):
   timely();chunk=os.read(leaf,min(4096,limit+1-total))
   timely()
   if not chunk:break
   total+=len(chunk)
   if total>limit:raise Failure('source')
   chunks.append(chunk)
  else:raise Failure('source')
  if total!=opened.st_size or identity(os.fstat(leaf))!=identity(opened) or identity(os.stat(parts[-1],dir_fd=fd,follow_symlinks=False))!=identity(opened):raise Failure('source')
  for path,dirfd,previous in dirs:
   if identity(path.lstat())!=identity(previous) or identity(os.fstat(dirfd))!=identity(previous):raise Failure('source')
  timely();result=b''.join(chunks);timely();return result
 except Failure:raise
 except (OSError,ValueError,TypeError):raise Failure('source') from None
 finally:
  for fd in reversed(fds):os.close(fd)
def unique(pairs):
 d={}
 for key,value in pairs:
  if key in d:raise Failure('manifest')
  d[key]=value
 return d
def validate(root=ROOT):
 try:
  d=json.loads(read_owned(root,MANIFEST,131072).decode('utf-8','strict'),object_pairs_hook=unique)
  if set(d)!={'schema_version','operations_origin','files','canonical_graph','finance_golden_origin','scope','canonical_deno_version'} or d['schema_version']!='operations-whole-scope-renderer-pure-closure.v1' or d['canonical_deno_version']!='2.8.1' or d['canonical_graph']!=list(PATHS) or set(d['files'])!=set(PATHS):raise Failure('manifest')
  if d['operations_origin']!={'repository':'BillyHamren1/kalender-vyer-mix','commit':'40ceb89bb01dcb1dfca75b4ece08bedc008d9c90','tree':'6e8c0766f9e82d79a4d014c165f100f4b5946419'}:raise Failure('manifest')
  finance={'repository':'BillyHamren1/eventflow-finance','commit':'2eca853a49ec69d23fd321f989c44ab09418921d','path':'supabase/functions/_shared/whole-scope-delivery-contract.ts','git_blob':'77a948268d8c007203298d8f69493b9138b8a630','sha256':'6e9c71210e72b5b8ba33c173977e1a974115244467439ee81999509cd70a4fed','size':18364}
  if d['finance_golden_origin']!=finance:raise Failure('manifest')
  for path in PATHS:
   r=d['files'][path]
   if set(r)!={'sha256','git_blob','size','origin'} or type(r['size']) is not int or not 0<r['size']<=524288 or r['origin']!=('new_source_candidate' if path in CANDIDATES else 'genuine_operations_40ce'):raise Failure('manifest')
   body=read_owned(root,path,524288,r['size'])
   if hashlib.sha256(body).hexdigest()!=r['sha256'] or hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()!=r['git_blob']:raise Failure('source')
  return d
 except Failure:raise
 except (KeyError,ValueError,TypeError,UnicodeError):raise Failure('manifest') from None
def main():
 try:
  if len(sys.argv)!=1:raise Failure('environment')
  environment(dict(os.environ));validate()
 except Exception as error:
  phase=object.__getattribute__(error,'__dict__')['phase'] if type(error) is Failure else 'source'
  print('renderer-pure FAIL '+phase,file=sys.stderr);return 1
 print('renderer-pure PASS exact_local11_genuine7_candidate4_precode');return 0
if __name__=='__main__':sys.exit(main())
