from unittest import mock
import hashlib,importlib.util,io,json,os,pathlib,subprocess,sys,tempfile,time,unittest
PATH=pathlib.Path(__file__).with_name('operations-compatible-catalog-http-wire.py')
SPEC=importlib.util.spec_from_file_location('catalog_wire',PATH);w=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(w)
class WireTests(unittest.TestCase):
 def compact(self,raw,size=1):
  out=io.BytesIO();c=w.CompactRecords(out)
  for i in range(0,len(raw),size):c.feed(raw[i:i+size])
  c.finish();return out.getvalue(),c
 def test_all_quoted_bytes_and_each_parsed_record_unchanged_across_chunks(self):
  records=[['table.a','table.b'],{'spaces':' a  b\t\r\n ','escape':'\\\"quoted\\\\','Unicode':'Ö漢😀','keys':{' a b ':' value '},'tokens':[None,True,False,1,2.5]}, {'identity':'table.a','count':0,'sha256':'a'*64}]
  raw=b'\n'.join(json.dumps(r,ensure_ascii=False,indent=None).encode() for r in records)+b'\n'
  expected=b'\n'.join(json.dumps(r,ensure_ascii=False,separators=(',',':')).encode() for r in records)+b'\n'
  for chunk in (1,2,3,7,64,65536):
   actual,c=self.compact(raw,chunk);self.assertEqual(actual,expected);self.assertEqual([json.loads(x) for x in actual.splitlines()],records);self.assertEqual(c.raw,len(raw));self.assertEqual(c.retained,len(expected));self.assertEqual(c.records,3)
 def test_exact_already_compact_output_is_noop(self):
  raw=b'{"literal":"space \\t \\"","number":1.00}\n'
  # Valid separately authored unchanged numeric token/scaled string vector.
  raw=b'{"literal":"space \\t","scaled":"1.00","number":1.00}\n'
  actual,_=self.compact(raw);self.assertEqual(actual,raw);self.assertEqual(hashlib.sha256(actual).digest(),hashlib.sha256(raw).digest())
 def test_nonstring_formatting_only_removed_and_lf_records_retained(self):
  raw=b' \t{ "a" : " \tinside " , "b" : [ 1 , 2 ] }\r\n\t [ "x y" ] \n'
  # An unescaped TAB inside a quoted string is deliberately malformed.
  with self.assertRaises(Exception):self.compact(raw)
  raw=raw.replace(b' \tinside ',b' \\tinside ');actual,_=self.compact(raw);self.assertEqual(actual,b'{"a":" \\tinside ","b":[1,2]}\n["x y"]\n')
 def test_malformed_utf8_duplicates_constants_trailing_and_unfinished_deny(self):
  for raw in (b'',b'\n',b'{"a":1,"a":2}\n',b'{"a":NaN}\n',b'{"a":"unfinished}\n',b'{"a":"\\',b'{}',b'{}garbage\n',b'{"a":"\xff"}\n',b'0\n',b'{"a":01}\n',b'{"a":1 2}\n',b'{"a":tru e}\n',b'{"a":1 e2}\n',b'{"a":- 1}\n',b'[nu ll]\n'):
   with self.subTest(raw_hash=hashlib.sha256(raw).hexdigest()),self.assertRaises(Exception):self.compact(raw)
 def test_raw_and_semantic_counters_bound_before_append_and_record_limit(self):
  c=w.CompactRecords(io.BytesIO())
  with self.assertRaises(w.WireFailure):c.feed(b' '*(w.RAW_LIMIT+1))
  self.assertEqual(c.raw,0);self.assertEqual(c.retained,0)
  c=w.CompactRecords(io.BytesIO());c.feed(b' '*(w.RAW_LIMIT))
  with self.assertRaises(w.WireFailure):c.feed(b' ')
  self.assertEqual(c.raw,w.RAW_LIMIT);self.assertEqual(c.retained,0)
  c=w.CompactRecords(io.BytesIO());c.feed(b'{"a":"'+b'a'*(w.RETAINED_LIMIT-6))
  self.assertEqual(c.retained,w.RETAINED_LIMIT)
  with self.assertRaises(w.WireFailure):c.feed(b'a')
  self.assertEqual(c.retained,w.RETAINED_LIMIT)
  c=w.CompactRecords(io.BytesIO());c.feed(b'{}\n'*w.RECORD_LIMIT)
  with self.assertRaises(w.WireFailure):c.feed(b'{}\n')
 def process_namespace(self):
  try:w.require_proc_self()
  except Exception:
   if os.environ.get('CI')=='true':self.fail('native_proc_namespace_required')
   self.skipTest('local proc PID namespace differs; actual native process proof required')
 def child(self,producer,seconds=2):
  self.process_namespace()
  script="import importlib.util,sys,os,json;spec=importlib.util.spec_from_file_location('w',sys.argv[1]);w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);\ntry:\n w.stream_process([sys.executable,'-c',sys.argv[2]],b'select readonly',sys.stdout.buffer,dict(os.environ),float(sys.argv[3]));sys.exit(0)\nexcept Exception:sys.exit(1)\n"
  with tempfile.TemporaryDirectory() as td:
   out=pathlib.Path(td)/'out';err=pathlib.Path(td)/'err'
   with out.open('wb') as stdout,err.open('wb') as stderr:
    start=time.monotonic();p=subprocess.Popen([sys.executable,'-I','-B','-c',script,str(PATH),producer,str(seconds)],stdout=stdout,stderr=stderr,start_new_session=True)
    try:status=p.wait(timeout=12)
    except subprocess.TimeoutExpired:os.killpg(p.pid,9);p.wait(timeout=5);self.fail('owned_child_deadline')
   return status,out.read_bytes(),time.monotonic()-start
 def test_actual_pipe_success_nonzero_and_malformed_child_never_success(self):
  status,raw,_=self.child("import sys;sys.stdin.buffer.read();sys.stdout.buffer.write(b'{ \\\"a\\\" : \\\"x y\\\" }\\n');sys.stdout.flush()")
  self.assertEqual(status,0);self.assertEqual(raw,b'{"a":"x y"}\n')
  for producer in ("import sys;sys.stdout.write('{}\\n');sys.stdout.flush();sys.exit(7)","import sys;sys.stdout.write('{bad}\\n');sys.stdout.flush()"):
   status,raw,_=self.child(producer);self.assertNotEqual(status,0)
 def test_actual_ignored_term_stalled_pipe_and_descendant_owned_cleanup(self):
  with tempfile.TemporaryDirectory() as td:
   marker=pathlib.Path(td)/'pid'
   producer="import signal,time,os,subprocess,sys;signal.signal(signal.SIGTERM,signal.SIG_IGN);p=subprocess.Popen([sys.executable,'-c','import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)']);open("+repr(str(marker))+",'w').write(str(p.pid));time.sleep(60)"
   status,raw,elapsed=self.child(producer,.3);self.assertNotEqual(status,0);self.assertLess(elapsed,8);self.assertEqual(raw,b'');self.assertTrue(marker.exists());pid=int(marker.read_text())
   try:
    state=pathlib.Path('/proc')/str(pid)/'stat';self.assertTrue(not state.exists() or state.read_text().rsplit(')',1)[1].split()[0]=='Z')
   except FileNotFoundError:pass
 def test_outer_owned_session_timeout_reaps_wrapper_and_ignored_producer(self):
  self.process_namespace()
  shared_path=PATH.with_name('operations-hired-personnel-native.py');spec=importlib.util.spec_from_file_location('frozen_owned_session',shared_path);shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)
  with tempfile.TemporaryDirectory() as td:
   directory=pathlib.Path(td);directory.chmod(0o700);marker=directory/'pid'
   producer="import signal,time,os;signal.signal(signal.SIGTERM,signal.SIG_IGN);open("+repr(str(marker))+",'w').write(str(os.getpid()));time.sleep(60)"
   script="import importlib.util,sys,os;spec=importlib.util.spec_from_file_location('w',sys.argv[1]);w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w);w.stream_process([sys.executable,'-c',sys.argv[2]],b'select readonly',sys.stdout.buffer,dict(os.environ),80)"
   start=time.monotonic()
   with self.assertRaises(shared.ClosedFailure):shared.run_private('wire_timeout',[sys.executable,'-I','-B','-c',script,str(PATH),producer],dict(os.environ),PATH.parent,directory,.6)
   self.assertLess(time.monotonic()-start,8);self.assertTrue(marker.exists());pid=int(marker.read_text())
   state=pathlib.Path('/proc')/str(pid)/'stat';self.assertTrue(not state.exists() or state.read_text().rsplit(')',1)[1].split()[0]=='Z')
 def test_same_pid_proc_guard_before_any_child(self):
  with mock.patch.object(w.os,'readlink',return_value=str(os.getpid()+1)),mock.patch.object(w.subprocess,'Popen') as create:
   with self.assertRaises(w.WireFailure):w.stream_process(['unused'],b'query',io.BytesIO(),{},1)
   create.assert_not_called()
 def test_process_scan_is_bounded_context_managed_and_uncertainty_denied(self):
  owner=123;selfrow=(owner,owner,owner,10,b'S');closed=[]
  class Entries:
   def __init__(self,rows):self.rows=rows
   def __enter__(self):return iter(self.rows)
   def __exit__(self,*args):closed.append(True)
  class Entry:
   def __init__(self,name):self.name=name
  with mock.patch.object(w,'require_proc_self',return_value=selfrow),mock.patch.object(w.os,'getpid',return_value=owner),mock.patch.object(w.os,'getsid',return_value=owner),mock.patch.object(w.os,'getpgid',return_value=owner):
   for rows,clock in (([Entry('x')]*16385,0),([Entry('1')],10)):
    with mock.patch.object(w.os,'scandir',return_value=Entries(rows)),mock.patch.object(w.time,'monotonic',return_value=clock),self.assertRaises(w.WireFailure):w.owned_members(owner,5)
   self.assertEqual(len(closed),2)
   with mock.patch.object(w.os,'scandir',return_value=Entries([Entry('1')])),mock.patch.object(w.time,'monotonic',return_value=0),mock.patch.object(w,'proc_identity',side_effect=PermissionError('PRIVATE_PROC_UNCERTAINTY')),self.assertRaises(PermissionError):w.owned_members(owner,5)
   with mock.patch.object(w.os,'scandir',return_value=Entries([Entry('1')])),mock.patch.object(w.time,'monotonic',return_value=0),mock.patch.object(w,'proc_identity',side_effect=FileNotFoundError):self.assertEqual(w.owned_members(owner,5),[])
 def test_final_scan_and_late_empty_wait_cannot_outlive_cleanup_deadline(self):
  owner=123;selfrow=(owner,owner,owner,10,b'S')
  class Entries:
   def __enter__(self):return iter([])
   def __exit__(self,*args):pass
  with mock.patch.object(w,'require_proc_self',return_value=selfrow),mock.patch.object(w.os,'getsid',return_value=owner),mock.patch.object(w.os,'getpgid',return_value=owner),mock.patch.object(w.os,'scandir',return_value=Entries()),mock.patch.object(w.time,'monotonic',return_value=5),self.assertRaises(w.WireFailure):w.owned_members(owner,5)
  child=mock.Mock()
  with mock.patch.object(w,'owned_members',return_value=[]),mock.patch.object(w.time,'monotonic',side_effect=[0,0,5]),self.assertRaises(w.WireFailure):w.stop_owned(child,owner)
  child.wait.assert_not_called()
  child=mock.Mock()
  with mock.patch.object(w,'owned_members',return_value=[]),mock.patch.object(w.time,'monotonic',side_effect=[0,0,1,5]),self.assertRaises(w.WireFailure):w.stop_owned(child,owner)
  child.wait.assert_called_once_with(timeout=4)
 def test_reused_member_starttime_never_signaled(self):
  child=mock.Mock();owner=123;identity=(456,owner,owner,10,b'S')
  with mock.patch.object(w,'owned_members',return_value=[identity]),mock.patch.object(w,'proc_identity',return_value=(456,owner,owner,11,b'S')),mock.patch.object(w.os,'kill') as kill,self.assertRaises(w.WireFailure):w.stop_owned(child,owner)
  kill.assert_not_called()
 def test_actual_raw_overflow_child_dies_without_output_or_hang(self):
  status,raw,elapsed=self.child("import sys,signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);sys.stdout.buffer.write(b' '* (16*1024*1024+1));sys.stdout.flush();time.sleep(60)",5)
  self.assertNotEqual(status,0);self.assertEqual(raw,b'');self.assertLess(elapsed,8)

if __name__=='__main__':unittest.main()
