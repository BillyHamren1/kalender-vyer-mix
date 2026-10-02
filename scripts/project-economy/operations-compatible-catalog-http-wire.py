#!/usr/bin/env python3
"""Lossless formatting compaction for one private, read-only catalogue capture.

Raw wire is separately bounded16MiB. The existing accepted JSON/file budget
remains8MiB. No string/token byte, LF record, field or source is removed.
This is a disposable native child, never an HTTP/SQL service or admission proof.
"""
import importlib.util, json, os, pathlib, selectors, signal, stat, subprocess, sys, tempfile, time

RAW_LIMIT=16*1024*1024
RETAINED_LIMIT=8*1024*1024
SQL_LIMIT=1024*1024
RECORD_LIMIT=258
PSQL=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
ROOT=pathlib.Path(__file__).resolve().parent.parent.parent

class WireFailure(Exception):
 def __init__(self):super().__init__('closed_wire_failure')

def unique_object(pairs):
 result={}
 for key,value in pairs:
  if key in result:raise WireFailure()
  result[key]=value
 return result

def invalid_constant(value):raise WireFailure()

class CompactRecords:
 def __init__(self,output):
  self.output=output;self.raw=0;self.retained=0;self.records=0;self.quoted=False;self.escaped=False;self.record=bytearray();self.gap=False;self.previous=None
 def feed(self,chunk):
  if type(chunk) is not bytes or self.raw+len(chunk)>RAW_LIMIT:raise WireFailure()
  self.raw+=len(chunk)
  for byte in chunk:
   if not self.quoted and byte in (9,13,32):self.gap=True;continue
   if self.gap and self.previous is not None and self.previous not in (123,125,91,93,44,58,34,10) and byte not in (123,125,91,93,44,58,34,10):raise WireFailure()
   self.gap=False;self.previous=byte
   if self.retained==RETAINED_LIMIT:raise WireFailure()
   self.retained+=1
   if not self.quoted and byte==10:
    if not self.record or self.records==RECORD_LIMIT:raise WireFailure()
    value=json.loads(self.record.decode('utf-8'),object_pairs_hook=unique_object,parse_constant=invalid_constant)
    if type(value) not in (dict,list):raise WireFailure()
    self.output.write(self.record);self.output.write(b'\n');self.record.clear();self.records+=1
   else:
    self.record.append(byte)
    if self.quoted:
     if self.escaped:self.escaped=False
     elif byte==92:self.escaped=True
     elif byte==34:self.quoted=False
    elif byte==34:self.quoted=True
 def finish(self):
  if self.quoted or self.escaped or self.record or not self.records:raise WireFailure()
  self.output.flush()

def proc_identity(pid):
 with (pathlib.Path('/proc')/str(pid)/'stat').open('rb') as source:data=source.read(4097)
 if len(data)>4096:raise WireFailure()
 prefix,fields=data.rsplit(b')',1);fields=fields.split()
 actual=int(prefix.split(b' ',1)[0])
 if actual!=pid or len(fields)<20:raise WireFailure()
 return (actual,int(fields[2]),int(fields[3]),int(fields[19]),fields[0])

def require_proc_self():
 owner=os.getpid()
 if os.readlink('/proc/self')!=str(owner):raise WireFailure()
 actual=proc_identity(owner)
 if actual[1]!=os.getpgid(0) or actual[2]!=os.getsid(0):raise WireFailure()
 return actual

def owned_members(owner,deadline):
 if require_proc_self()[0]!=owner or os.getsid(0)!=owner or os.getpgid(0)!=owner:raise WireFailure()
 result=[];scanned=0
 with os.scandir('/proc') as entries:
  for entry in entries:
   scanned+=1
   if scanned>16384 or time.monotonic()>=deadline:raise WireFailure()
   if not entry.name.isdecimal():continue
   pid=int(entry.name)
   if pid==owner:continue
   try:
    if os.getsid(pid)!=owner or os.getpgid(pid)!=owner:continue
    identity=proc_identity(pid)
    if identity[1]!=owner or identity[2]!=owner:raise WireFailure()
    if identity[4]!=b'Z':result.append(identity)
    if len(result)>256:raise WireFailure()
   except (ProcessLookupError,FileNotFoundError):continue
 if time.monotonic()>=deadline:raise WireFailure()
 return result

def stop_owned(child,owner):
 end=time.monotonic()+5;term_until=time.monotonic()+.25
 while True:
  child.poll();members=owned_members(owner,end)
  if not members:
   remaining=end-time.monotonic()
   if remaining<=0:raise WireFailure()
   child.wait(timeout=remaining)
   if time.monotonic()>=end:raise WireFailure()
   return
  if time.monotonic()>=end:raise WireFailure()
  sig=signal.SIGTERM if time.monotonic()<term_until else signal.SIGKILL
  for identity in members:
   if time.monotonic()>=end:raise WireFailure()
   pid=identity[0]
   try:
    current=proc_identity(pid)
    if current[:4]!=identity[:4] or os.getsid(pid)!=owner or os.getpgid(pid)!=owner:raise WireFailure()
    if current[4]!=b'Z':os.kill(pid,sig)
   except (ProcessLookupError,FileNotFoundError):pass
  time.sleep(.02)

def stream_process(command,query,output,env,seconds=80):
 owner=os.getpid();require_proc_self()
 if sys.platform!='linux' or os.getsid(0)!=owner or os.getpgid(0)!=owner or type(query) is not bytes or not query or len(query)>SQL_LIMIT or not 0<seconds<=80:raise WireFailure()
 child=None;reader=None;selector=None;end=time.monotonic()+seconds
 try:
  # An anonymous private file avoids deadlock between a full stdin pipe and
  # PostgreSQL's first large stdout record. It is unlinked before child start.
  with tempfile.TemporaryFile(mode='w+b') as source:
   os.fchmod(source.fileno(),0o600);source.write(query);source.seek(0)
   child=subprocess.Popen(command,stdin=source,stdout=subprocess.PIPE,stderr=sys.stderr.buffer,env=env,close_fds=True)
   reader=child.stdout;os.set_blocking(reader.fileno(),False);selector=selectors.DefaultSelector();selector.register(reader,selectors.EVENT_READ);compact=CompactRecords(output)
   while True:
    remaining=end-time.monotonic()
    if remaining<=0:raise WireFailure()
    if not selector.select(min(.25,remaining)):continue
    chunk=os.read(reader.fileno(),65536)
    if not chunk:break
    compact.feed(chunk)
   compact.finish()
   remaining=end-time.monotonic()
   if remaining<=0:raise WireFailure()
   status=child.wait(timeout=remaining)
   if status!=0:raise WireFailure()
 finally:
  failed=False
  for resource in (selector,reader):
   if resource is not None:
    try:resource.close()
    except Exception:failed=True
  if child is not None:
   try:stop_owned(child,owner)
   except Exception:failed=True
  if failed:raise WireFailure()

def load_native():
 path=pathlib.Path(__file__).with_name('operations-compatible-catalog-http-native.py')
 spec=importlib.util.spec_from_file_location('catalog_wire_frozen_entry',path);native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
 return native

def validate_parent_environment(native,env):
 # Only the parent's already-guarded, fixed internal connection deadline is
 # removed for external validation; it stays present in the actual psql env.
 if env.get('PGCONNECT_TIMEOUT')!='5':raise WireFailure()
 external=dict(env);del external['PGCONNECT_TIMEOUT'];native.validate_environment(external)

def main():
 try:
  if len(sys.argv)!=1:raise WireFailure()
  native=load_native();validate_parent_environment(native,dict(os.environ));native.load_source()
  for stream in (sys.stdout.buffer,sys.stderr.buffer):
   info=os.fstat(stream.fileno())
   if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode)!=0o600 or info.st_uid!=os.geteuid() or info.st_nlink!=1:raise WireFailure()
  query=sys.stdin.buffer.read(SQL_LIMIT+1)
  # Only the trusted parent's exact read-only snapshot protocol is admitted.
  expected=(native.options()+'begin isolation level repeatable read read only;').encode()
  frozen=(ROOT/'scripts/project-economy/operations-compatible-full-catalog-read.sql').read_bytes()
  if not query.startswith(expected) or not query.endswith(b'commit;') or query.count(frozen)!=1:raise WireFailure()
  stream_process(PSQL,query,sys.stdout.buffer,dict(os.environ));return 0
 except Exception:return 1

if __name__=='__main__':sys.exit(main())
