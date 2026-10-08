import fs from 'node:fs';
import path from 'node:path';

const refused = () => { throw new Error('sdk_source_refused'); };
const identity = value => ['dev','ino','uid','gid','nlink','mode','size','mtimeNs','ctimeNs'].map(k => value[k]);
const equal = (a,b) => identity(a).every((v,i) => v === identity(b)[i]);
const flags = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK;
const at = (fd,name) => `/proc/self/fd/${fd}/${name}`;

/** Linux FD-relative admission reads; no caller-supplied path is executed. */
export class StableSourceReader {
  constructor(root, fresh) {
    this.fd = undefined;
    try {
      if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root ||
          fs.realpathSync(root) !== root || typeof fresh !== 'function') refused();
      this.root = root; this.fresh = fresh; fresh();
      this.before = fs.lstatSync(root, { bigint:true });
      if (!this.before.isDirectory()) refused();
      this.fd = fs.openSync(root, flags | fs.constants.O_DIRECTORY);
      if (!equal(this.before, fs.fstatSync(this.fd,{bigint:true}))) refused();
      fresh();
    } catch { this.close(); refused(); }
  }
  check() {
    this.fresh();
    if (this.fd === undefined || !equal(this.before,fs.fstatSync(this.fd,{bigint:true})) ||
        !equal(this.before,fs.lstatSync(this.root,{bigint:true}))) refused();
    this.fresh();
  }
  read(relative,maximum) {
    const opened=[], slots=[];
    try {
      this.check();
      if (typeof relative !== 'string' || relative.length > 512 ||
          !/^[A-Za-z0-9_./$@\[\]-]+$/.test(relative) ||
          relative.split('/').some(p => !p || p === '.' || p === '..') ||
          !Number.isSafeInteger(maximum) || maximum < 0 || maximum > 1_048_576) refused();
      const parts=relative.split('/'); let parent=this.fd;
      for(const part of parts.slice(0,-1)) {
        this.fresh(); const location=at(parent,part), before=fs.lstatSync(location,{bigint:true});
        if(!before.isDirectory()) refused();
        const child=fs.openSync(location, flags | fs.constants.O_DIRECTORY); opened.push(child);
        if(!equal(before,fs.fstatSync(child,{bigint:true}))) refused();
        slots.push({parent,part,before,child}); parent=child;
      }
      const name=parts.at(-1), location=at(parent,name);
      this.fresh(); const before=fs.lstatSync(location,{bigint:true});
      if(!before.isFile() || before.uid !== BigInt(process.geteuid()) || before.nlink !== 1n ||
          before.size < 0n || before.size > BigInt(maximum)) refused();
      const leaf=fs.openSync(location,flags); opened.push(leaf);
      const validate = () => {
        this.check();
        if(!equal(before,fs.fstatSync(leaf,{bigint:true})) ||
            !equal(before,fs.lstatSync(location,{bigint:true}))) refused();
        for(const slot of slots) {
          this.fresh();
          if(!equal(slot.before,fs.fstatSync(slot.child,{bigint:true})) ||
              !equal(slot.before,fs.lstatSync(at(slot.parent,slot.part),{bigint:true}))) refused();
        }
        this.fresh();
      };
      // No byte is read until the full directory/path/FD chain is established.
      validate(); const expected=Number(before.size), pieces=[]; let count=0;
      while(count <= expected) {
        this.fresh(); const buffer=Buffer.alloc(Math.min(65536,expected+1-count));
        const size=fs.readSync(leaf,buffer,0,buffer.length,null); this.fresh();
        if(size === 0) break;
        pieces.push(buffer.subarray(0,size)); count+=size;
        if(count > expected) refused();
      }
      if(count !== expected) refused(); validate();
      return Buffer.concat(pieces,count);
    } catch { refused(); }
    finally { for(const fd of opened.reverse()) fs.closeSync(fd); }
  }
  inventory(prefixes,allowed) {
    const found=new Set(), directories=new Set(); let visited=0;
    for(const name of allowed) { const parts=name.split('/');
      for(let n=1;n<parts.length;n++) directories.add(parts.slice(0,n).join('/')); }
    const walk=(fd,prefix,depth) => {
      this.fresh(); if(depth > 32) refused();
      const before=fs.fstatSync(fd,{bigint:true}), iterator=fs.opendirSync(`/proc/self/fd/${fd}`);
      try {
        while(true) {
          this.fresh(); const entry=iterator.readSync(); this.fresh(); if(!entry) break;
          if(++visited > 6000) refused();
          const name=`${prefix}/${entry.name}`, location=at(fd,entry.name);
          const stat=fs.lstatSync(location,{bigint:true});
          if(stat.isDirectory()) {
            if(!directories.has(name)) refused();
            const child=fs.openSync(location,flags|fs.constants.O_DIRECTORY);
            try {
              if(!equal(stat,fs.fstatSync(child,{bigint:true}))) refused();
              walk(child,name,depth+1);
              if(!equal(stat,fs.fstatSync(child,{bigint:true})) ||
                  !equal(stat,fs.lstatSync(location,{bigint:true}))) refused();
            } finally { fs.closeSync(child); }
          } else if(stat.isFile() && allowed.has(name)) found.add(name);
          else refused();
        }
      } finally { iterator.closeSync(); }
      if(!equal(before,fs.fstatSync(fd,{bigint:true}))) refused(); this.fresh();
    };
    try {
      this.check();
      for(const relative of prefixes) {
        const opened=[],slots=[]; let parent=this.fd;
        try {
          for(const part of relative.split('/')) {
            this.fresh(); const before=fs.lstatSync(at(parent,part),{bigint:true});
            if(!before.isDirectory()) refused();
            const child=fs.openSync(at(parent,part),flags|fs.constants.O_DIRECTORY);opened.push(child);
            if(!equal(before,fs.fstatSync(child,{bigint:true}))) refused();
            slots.push({parent,part,before,child});parent=child;
          }
          walk(parent,relative,1);
          for(const s of slots) if(!equal(s.before,fs.fstatSync(s.child,{bigint:true})) ||
              !equal(s.before,fs.lstatSync(at(s.parent,s.part),{bigint:true}))) refused();
        } finally { for(const fd of opened.reverse()) fs.closeSync(fd); }
      }
      this.check(); return found;
    } catch { refused(); }
  }
  close() {
    if(this.fd !== undefined) { const fd=this.fd; this.fd=undefined; fs.closeSync(fd); }
  }
}

/** Register before racing creation, so a late server never escapes teardown. */
export function trackServerCreation(pending, refusedNow) {
  let server, closing;
  const closeServer=() => {
    if(!closing) closing=Promise.resolve().then(()=>server.close());
    return closing;
  };
  const ready=Promise.resolve(pending).then(value=>{
    server=value;
    if(refusedNow()) void closeServer().catch(()=>{});
    return value;
  });
  void ready.catch(()=>{});
  return { ready, close: async()=>{ await ready; await closeServer(); } };
}
