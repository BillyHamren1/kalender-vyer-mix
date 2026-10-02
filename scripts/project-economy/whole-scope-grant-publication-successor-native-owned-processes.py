"""NEW isolated adapter: an unreaped owned leader reserves its session until drain.
No frozen helper edits. No group/proc/PID operations after reaping_started.
"""
import os
import pathlib
import signal
import time

class OwnershipLost(Exception):
 pass

def snapshot(pid):
 if type(pid) is not int or pid<=1:raise OwnershipLost()
 root=pathlib.Path('/proc')/str(pid)
 try:
  with (root/'stat').open('rb') as source:raw=source.read(4097)
  if len(raw)>4096:raise OwnershipLost()
  end=raw.rfind(b')');parts=raw[end+2:].split()
  if end<0 or len(parts)<20 or int(raw[:raw.find(b'(')].strip())!=pid:raise OwnershipLost()
  return (pid,os.stat(root).st_uid,int(parts[2]),int(parts[3]),int(parts[19]),parts[0])
 except (FileNotFoundError,ProcessLookupError):return None

def guarded_native(base,failure):
 class GuardedNative(base):
  def __init__(self,*args,**kwargs):
   super().__init__(*args,**kwargs);self.custody={}
   if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal') or not hasattr(os,'WNOWAIT'):raise failure('guard')
  def start_process(self,*args,**kwargs):
   # Verify that /proc and the process syscalls describe this PID namespace.
   current=snapshot(os.getpid())
   if current is None or current[1]!=os.getuid() or current[2]!=os.getpgrp() or current[3]!=os.getsid(0):raise failure('guard')
   child=super().start_process(*args,**kwargs)
   record={'stage':'owned','leader':None,'status':None};self.custody[child]=record
   try:
    leader=snapshot(child.pid)
    if leader is None or leader[1]!=os.getuid() or leader[2]!=child.pid or leader[3]!=child.pid or os.getpgid(child.pid)!=child.pid or os.getsid(child.pid)!=child.pid:raise OwnershipLost()
    record['leader']=leader[:5];self._bound(child)
    return child
   except Exception:
    record['stage']='ownership_lost';raise failure('cleanup',retain=True) from None
  def _record(self,child):
   record=self.custody.get(child)
   if record is None or record['stage']!='owned' or record['leader'] is None:raise failure('cleanup',retain=True)
   return record
  def _bound(self,child):
   record=self._record(child)
   try:
    current=snapshot(child.pid)
    if current is None or current[:5]!=record['leader'] or os.getpgid(child.pid)!=child.pid or os.getsid(child.pid)!=child.pid:raise OwnershipLost()
    return current
   except Exception:
    record['stage']='ownership_lost';raise failure('cleanup',retain=True) from None
  def _exit(self,child):
   record=self._record(child);self._bound(child)
   try:status=os.waitid(os.P_PID,child.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
   except Exception:
    record['stage']='ownership_lost';raise failure('cleanup',retain=True) from None
   self._bound(child)
   if status is not None:
    if status.si_pid!=child.pid or status.si_code not in {os.CLD_EXITED,os.CLD_KILLED,os.CLD_DUMPED}:
     record['stage']='ownership_lost';raise failure('cleanup',retain=True)
    record['status']=status.si_status if status.si_code==os.CLD_EXITED else -status.si_status
   return status
  def _members(self,child,deadline):
   self._bound(child);members=[];count=0
   with os.scandir('/proc') as entries:
    for entry in entries:
     count+=1
     if count>32768 or time.monotonic()>=deadline:raise failure('cleanup',retain=True)
     if not entry.name.isdecimal():continue
     pid=int(entry.name)
     try:
      if os.getpgid(pid)!=child.pid or os.getsid(pid)!=child.pid:continue
      current=snapshot(pid)
     except ProcessLookupError:continue
     if time.monotonic()>=deadline:raise failure('cleanup',retain=True)
     if current is None:continue
     if current[1]!=os.getuid() or current[2]!=child.pid or current[3]!=child.pid:raise failure('cleanup',retain=True)
     if current[5]!=b'Z':members.append(current[:5])
     if len(members)>4096:raise failure('cleanup',retain=True)
   self._bound(child)
   if time.monotonic()>=deadline:raise failure('cleanup',retain=True)
   return members
  def _signal(self,child,member,requested):
   self._bound(child);fd=None
   try:
    fd=os.pidfd_open(member[0],0)
    current=snapshot(member[0])
    if current is None:return
    if current[:5]!=member or os.getpgid(member[0])!=child.pid or os.getsid(member[0])!=child.pid:raise failure('cleanup',retain=True)
    self._bound(child)
    signal.pidfd_send_signal(fd,requested,None,0)
   except ProcessLookupError:return
   finally:
    if fd is not None:os.close(fd)
  def terminate(self,child):
   if child not in self.children:raise failure('cleanup',retain=True)
   record=self.custody.get(child)
   if record is not None and record['stage']=='reaped':return
   record=self._record(child);self._bound(child)
   deadline=time.monotonic()+8;term_until=time.monotonic()+1.5
   while True:
    members=self._members(child,min(deadline,time.monotonic()+1.5))
    status=self._exit(child)
    if not members and status is not None:break
    if time.monotonic()>=deadline:raise failure('cleanup',retain=True)
    requested=signal.SIGTERM if time.monotonic()<term_until else signal.SIGKILL
    for member in members:
     if time.monotonic()>=deadline:raise failure('cleanup',retain=True)
     self._signal(child,member,requested)
    time.sleep(.02)
   # The exited but UNREAPED leader still reserves the group/session number.
   # No live member can fork now. Recheck before irreversible wait ownership loss.
   if self._members(child,min(deadline,time.monotonic()+1.5)) or self._exit(child) is None:raise failure('cleanup',retain=True)
   record['stage']='reaping_started'
   # Prevent Popen destructor/poll/wait retry from performing numeric PID work.
   # WNOWAIT already captured the exit; exactly ONE direct nonblocking reap.
   child.returncode=record['status']
   try:
    pid,status=os.waitpid(child.pid,os.WNOHANG)
    if pid!=child.pid or os.waitstatus_to_exitcode(status)!=record['status'] or time.monotonic()>=deadline:raise failure('cleanup',retain=True)
    record['stage']='reaped'
   except BaseException:raise failure('cleanup',retain=True) from None
  def finish(self,child,expected_code=None,timeout=35):
   if child not in self.children:raise failure('case')
   out,err,started,_name=self.children[child];deadline=started+timeout
   try:
    while True:
     status=self._exit(child)
     if time.monotonic()>=deadline:raise failure('case')
     if status is not None:break
     time.sleep(.02)
   finally:
    self.terminate(child)
    if self.custody[child]['stage']=='reaped':
     self.children.pop(child,None)
     record=self.custody.pop(child)
   # Both leader and live owned group are complete before consuming log bytes.
   if out.stat().st_size>8*1024*1024 or err.stat().st_size>8*1024*1024:raise failure('case')
   code=self.shared.sqlstate(err)
   if expected_code is None:
    if record['status']!=0:raise failure('case',code)
   elif record['status']==0 or code!=expected_code:raise failure('case',code)
   return out
  def wait(self,name,kind):
   owned=[p for p,v in self.children.items() if v[3]==name]
   if len(owned)!=1 or kind not in {'PgSleep','Lock'}:raise failure('case')
   child=owned[0];deadline=time.monotonic()+4
   while time.monotonic()<deadline:
    if self._exit(child) is not None:raise failure('case')
    value=self.run("select jsonb_build_object('waiting',count(*)=1) from pg_stat_activity where datname='eventflow_scope_product_publication_runtime' and application_name='"+name+"' and state='active' and "+("wait_event='PgSleep'" if kind=='PgSleep' else "wait_event_type='Lock'")+";")
    if value=={'waiting':True}:return
    time.sleep(.08)
   raise failure('case')
  def cleanup(self):
   failed=False
   for child in list(self.children):
    try:
     self.terminate(child)
     if self.custody[child]['stage']=='reaped':self.children.pop(child,None);self.custody.pop(child,None)
    except Exception:failed=True
   if failed:raise failure('cleanup',retain=True)
 return GuardedNative
