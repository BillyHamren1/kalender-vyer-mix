#!/usr/bin/env python3
"""Immutable-source bootstrap for the digest-pinned compatible-read runner."""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import signal
import stat
import struct
import sys
import tempfile
import types

HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
CLOSURE=HERE/'operations-scope-compatible-read-native-pinned-postgrest-closure.json'
IMPLEMENTATION='scripts/project-economy/operations-scope-compatible-read-native-pinned-postgrest-impl.py'
BOOTSTRAP='scripts/project-economy/operations-scope-compatible-read-native-pinned-postgrest.py'
SCHEMA='operations-scope-compatible-read-native-pinned-postgrest-closure.v4'
IMAGE_ENV='EVENTFLOW_SCOPE_COMPATIBLE_READ_POSTGREST_IMAGE'
IMAGE='postgrest/postgrest@sha256:729bf65c733b73f5b52777f0e4b853f22ed73aa67a22d38269d289779b0a8401'
FS_IOC_GETFLAGS=0x80086601
FS_IOC_SETFLAGS=0x40086602
FS_IMMUTABLE_FL=0x00000010

PUBLIC_PHASES={'capture','materialize','immutable_seal','post_seal_verify','compile','install','pre_effect_verify','effects','final_verify','owned_cleanup'}
ACTIVE_PHASE='capture'

def phase(value):
    global ACTIVE_PHASE
    if value not in PUBLIC_PHASES:raise BootstrapFailure()
    ACTIVE_PHASE=value

class BootstrapFailure(Exception):pass

def identity(value):
    return (value.st_dev,value.st_ino,value.st_mode,value.st_uid,value.st_gid,value.st_nlink,value.st_size,value.st_mtime_ns,value.st_ctime_ns)

def blob(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def flags(fd):return struct.unpack('I',fcntl.ioctl(fd,FS_IOC_GETFLAGS,struct.pack('I',0)))[0]

def set_flags(fd,value):fcntl.ioctl(fd,FS_IOC_SETFLAGS,struct.pack('I',value))

def compiled_module(data,filename,name,effect_capability):
    module=types.ModuleType(name);module.__file__=str(filename);module.__package__=''
    module.__dict__['__held_effect_capability__']=effect_capability
    exec(compile(data,str(filename),'exec'),module.__dict__)
    if '__held_effect_capability__' in module.__dict__:raise BootstrapFailure()
    return module

class HeldTree:
    def __init__(self,root,closure,bootstrap_authority,closure_authority):
        self.root=root.absolute();self.closure_path=closure.absolute();self.canonical={};self.materialized={};self.directories=[];self.mirror=None
        self.bootstrap_authority=bootstrap_authority;self.closure_authority=closure_authority
        try:self._capture()
        except BaseException:
            self.close();raise

    def _open(self,path,maximum,directory=False):
        mode=os.O_RDONLY|os.O_CLOEXEC|(os.O_DIRECTORY if directory else 0)
        if hasattr(os,'O_NOFOLLOW'):mode|=os.O_NOFOLLOW
        fd=os.open(path,mode);before=os.fstat(fd)
        if directory:
            if not stat.S_ISDIR(before.st_mode) or before.st_mode&0o022:os.close(fd);raise BootstrapFailure()
            return fd,before,b''
        if not stat.S_ISREG(before.st_mode) or before.st_nlink!=1 or before.st_mode&0o022 or before.st_size>maximum:os.close(fd);raise BootstrapFailure()
        chunks=[];total=0
        while True:
            part=os.read(fd,65536)
            if not part:break
            total+=len(part)
            if total>maximum:os.close(fd);raise BootstrapFailure()
            chunks.append(part)
        after=os.fstat(fd)
        if identity(before)!=identity(after) or identity(after)!=identity(os.stat(path,follow_symlinks=False)):os.close(fd);raise BootstrapFailure()
        return fd,after,b''.join(chunks)

    def _held(self,authority,path,maximum):
        if not isinstance(authority,dict) or set(authority)!={'fd','identity','bytes'} or not isinstance(authority['fd'],int) or not isinstance(authority['bytes'],bytes) or len(authority['bytes'])>maximum:raise BootstrapFailure()
        fd=os.dup(authority['fd']);saved=os.fstat(fd);data=authority['bytes']
        if identity(saved)!=authority['identity'] or identity(saved)!=identity(os.stat(path,follow_symlinks=False)):os.close(fd);raise BootstrapFailure()
        os.lseek(fd,0,os.SEEK_SET)
        if os.read(fd,len(data)+1)!=data:os.close(fd);raise BootstrapFailure()
        return fd,saved,data

    def _capture(self):
        fd,saved,data=self._held(self.closure_authority,self.closure_path,2*1024*1024);self.canonical['@closure']=(fd,self.closure_path,identity(saved),data)
        bfd,bsaved,bdata=self._held(self.bootstrap_authority,self.root/BOOTSTRAP,128*1024);self.canonical['@bootstrap']=(bfd,self.root/BOOTSTRAP,identity(bsaved),bdata)
        try:value=json.loads(data.decode(),parse_constant=lambda _v:(_ for _ in ()).throw(ValueError()))
        except Exception:raise BootstrapFailure() from None
        if set(value)!={'schema','database','ordered_schema_paths','files','postgrest'} or value['schema']!=SCHEMA or value['database']!='eventflow_scope_publication_runtime' or value['postgrest']!={'environment':IMAGE_ENV,'image':IMAGE}:raise BootstrapFailure()
        if not isinstance(value['files'],dict) or len(value['files'])!=87 or IMPLEMENTATION not in value['files'] or BOOTSTRAP in value['files'] or '.github/workflows/operations-project-economy.yml' in value['files']:raise BootstrapFailure()
        self.value=value
        for relative,expected in sorted(value['files'].items()):
            pure=pathlib.PurePosixPath(relative)
            if pure.is_absolute() or '..' in pure.parts or set(expected)!={'sha256','git_blob','bytes'} or not isinstance(expected['bytes'],int) or not re.fullmatch('[0-9a-f]{64}',expected['sha256']) or not re.fullmatch('[0-9a-f]{40}',expected['git_blob']):raise BootstrapFailure()
            fd,saved,data=self._open(self.root/relative,8*1024*1024)
            if len(data)!=expected['bytes'] or hashlib.sha256(data).hexdigest()!=expected['sha256'] or blob(data)!=expected['git_blob']:os.close(fd);raise BootstrapFailure()
            self.canonical[relative]=(fd,self.root/relative,identity(saved),data)

    def materialize(self):
        parent=pathlib.Path(tempfile.mkdtemp(prefix='operations-compatible-immutable-',dir='/tmp'));parent.chmod(0o700);mirror=parent/'root';mirror.mkdir(mode=0o700);self.mirror=mirror
        entries=dict(self.value['files']);entries['scripts/project-economy/operations-scope-compatible-read-native-pinned-postgrest-closure.json']={'closure':True}
        for relative in sorted(entries):
            target=mirror/relative;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            data=self.canonical['@closure'][3] if 'closure' in entries[relative] else self.canonical[relative][3]
            fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_CLOEXEC,0o400)
            try:
                offset=0
                while offset<len(data):offset+=os.write(fd,data[offset:])
                os.fsync(fd)
            finally:os.close(fd)
            fd,saved,read=self._open(target,len(data));
            if read!=data:os.close(fd);raise BootstrapFailure()
            self.materialized[relative]=(fd,target,identity(saved),data,flags(fd))
        for directory in sorted((p for p in parent.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):
            directory.chmod(0o500);fd,saved,_=self._open(directory,0,True);self.directories.append((fd,directory,identity(saved),flags(fd)))
        parent.chmod(0o500);fd,saved,_=self._open(parent,0,True);self.directories.append((fd,parent,identity(saved),flags(fd)))
        return mirror

    def seal(self):
        for key,(fd,path,_saved,data,old) in tuple(self.materialized.items()):
            set_flags(fd,old|FS_IMMUTABLE_FL);current=os.fstat(fd)
            if identity(current)!=identity(os.stat(path,follow_symlinks=False)):raise BootstrapFailure()
            self.materialized[key]=(fd,path,identity(current),data,old)
        updated=[]
        for fd,path,_saved,old in self.directories:
            set_flags(fd,old|FS_IMMUTABLE_FL);current=os.fstat(fd)
            if identity(current)!=identity(os.stat(path,follow_symlinks=False)):raise BootstrapFailure()
            updated.append((fd,path,identity(current),old))
        self.directories=updated
        self.verify(True)

    def verify(self,immutable=False):
        for fd,path,saved,data in self.canonical.values():
            if identity(os.fstat(fd))!=saved or identity(os.stat(path,follow_symlinks=False))!=saved:raise BootstrapFailure()
            os.lseek(fd,0,os.SEEK_SET);actual=b''
            while len(actual)<len(data):
                part=os.read(fd,min(65536,len(data)-len(actual)))
                if not part:raise BootstrapFailure()
                actual+=part
            if actual!=data or os.read(fd,1):raise BootstrapFailure()
        for fd,path,saved,data,_old in self.materialized.values():
            if identity(os.fstat(fd))!=saved or identity(os.stat(path,follow_symlinks=False))!=saved or (immutable and not flags(fd)&FS_IMMUTABLE_FL):raise BootstrapFailure()
            os.lseek(fd,0,os.SEEK_SET);actual=os.read(fd,len(data)+1)
            if actual!=data:raise BootstrapFailure()
        if immutable:
            for fd,path,saved,_old in self.directories:
                if identity(os.fstat(fd))!=saved or identity(os.stat(path,follow_symlinks=False))!=saved or not flags(fd)&FS_IMMUTABLE_FL:raise BootstrapFailure()

    def bytes(self,relative):return self.materialized[relative][3]

    def clear_and_discard(self):
        for fd,_path,_saved,old in reversed(self.directories):set_flags(fd,old)
        for fd,_path,_saved,_data,old in self.materialized.values():set_flags(fd,old)
        parent=self.mirror.parent
        for path in sorted(parent.rglob('*'),key=lambda p:len(p.parts),reverse=True):path.chmod(0o700 if path.is_dir() else 0o600)
        parent.chmod(0o700);shutil.rmtree(parent)

    def close(self):
        for value in (*self.canonical.values(),*self.materialized.values(),*self.directories):
            try:os.close(value[0])
            except OSError:pass

def execute(env):
    bootstrap_authority=globals().get('__held_bootstrap__');closure_authority=globals().get('__held_closure__')
    phase('capture')
    tree=HeldTree(ROOT,CLOSURE,bootstrap_authority,closure_authority);success=False
    try:
        phase('materialize');mirror=tree.materialize()
        phase('immutable_seal');tree.seal()
        phase('post_seal_verify');tree.verify(True)
        path=mirror/IMPLEMENTATION
        effect_capability=object()
        phase('compile')
        module=compiled_module(tree.bytes(IMPLEMENTATION),path,'operations_compatible_read_pinned_impl',effect_capability)
        phase('install');module._install_held_authority(effect_capability,env)
        delattr(module,'_install_held_authority')
        phase('pre_effect_verify');tree.verify(True) # Last pre-effect gate; all subsequently opened paths are kernel immutable.
        phase('effects');module._execute_materialized(effect_capability)
        phase('final_verify');tree.verify(True);success=True
    finally:
        if success:
            phase('owned_cleanup');tree.clear_and_discard()
        tree.close()

def main():
    signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(BootstrapFailure()))
    signal.signal(signal.SIGINT,lambda *_:(_ for _ in ()).throw(BootstrapFailure()))
    try:execute(dict(os.environ));return 0
    except BaseException:
        print('operations-scope-compatible-read-native FAIL source_closure PHASE='+ACTIVE_PHASE,file=sys.stderr);return 1

if __name__=='__main__':sys.exit(main())
