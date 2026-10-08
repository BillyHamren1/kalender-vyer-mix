"""TEST ONLY: bounded owned-session commands; no financial or Docker policy here."""
import os
import json
import math
from pathlib import Path
import resource
import secrets
import signal
import subprocess
import time


# Actual Popen handles remain strongly owned on uncertain cleanup; never accepted.
UNCERTAIN_CHILDREN = {}
# Irreversible reap receipts retain the exact handle. Once reaping begins there
# must never be another numeric PID lookup, signal, wait retry or group scan.
REAPING_CHILDREN = {}


class ProcessFailure(Exception):
    def __init__(self, retain=True):
        self.retain = retain


def check(deadline):
    if time.monotonic() >= deadline:
        raise ProcessFailure()


def identity(pid):
    raw = (Path('/proc') / str(pid) / 'stat').read_text()
    fields = raw.rsplit(')', 1)[1].split()
    if int(raw.split(' ', 1)[0]) != pid or len(fields) < 20:
        raise ProcessFailure()
    return (pid, int(fields[19]), int(fields[2]), int(fields[3]), fields[0])


def proc_identity_valid():
    """A virtualized PID view cannot certify or signal an owned Linux session."""
    try:
        pid = os.getpid()
        raw = Path('/proc/self/stat').read_text()
        exact = identity(pid)
        return int(raw.split(' ', 1)[0]) == pid and exact[2:4] == (os.getpgid(pid), os.getsid(pid))
    except (ValueError, OSError, IndexError, ProcessFailure):
        return False


def leader_current(saved, deadline):
    check(deadline)
    now = identity(saved[0])
    if now[:4] != saved[:4] or os.getpgid(saved[0]) != saved[2] or os.getsid(saved[0]) != saved[3]:
        raise ProcessFailure()
    check(deadline)


def live_owned_group(group_id, deadline=None):
    """Bounded scan; terminal members never authorize a signal."""
    deadline = time.monotonic() + 1 if deadline is None else deadline
    live = []
    check(deadline)
    with os.scandir('/proc') as entries:
        for count, entry in enumerate(entries, 1):
            check(deadline)
            if count > 32768:
                raise ProcessFailure()
            if not entry.name.isdecimal():
                continue
            pid = int(entry.name)
            try:
                saved = identity(pid)
                if saved[2:4] != (group_id, group_id) or saved[4] in {'Z', 'X'}:
                    continue
                if os.getpgid(pid) != group_id or os.getsid(pid) != group_id:
                    raise ProcessFailure()
                live.append(saved)
            except (FileNotFoundError, ProcessLookupError):
                continue
    check(deadline)
    return live


def signal_owned(saved_leader, requested, deadline):
    leader_current(saved_leader, deadline)
    for saved in live_owned_group(saved_leader[0], deadline):
        check(deadline)
        leader_current(saved_leader, deadline)
        member_fd = None
        try:
            # A leader zombie pins the group/session, not a reaped member's PID.
            # Open the actual member handle first, then prove its saved identity.
            member_fd = os.pidfd_open(saved[0], 0)
            check(deadline)
            now = identity(saved[0])
            if now[:4] != saved[:4] or os.getpgid(saved[0]) != saved[2] or os.getsid(saved[0]) != saved[3]:
                raise ProcessFailure()
            check(deadline)
            signal.pidfd_send_signal(member_fd, requested, None, 0)
        except (FileNotFoundError, ProcessLookupError):
            pass
        finally:
            if member_fd is not None:
                os.close(member_fd)
    check(deadline)


def exited_unreaped(child, saved, deadline):
    leader_current(saved, deadline)
    value = os.waitid(os.P_PID, child.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
    check(deadline)
    return value


def stop_owned(child, saved, deadline):
    """Pin unreaped leader until no live member remains; no poll/wait before signals."""
    if child is None:
        return
    reaping = REAPING_CHILDREN.get(id(child))
    if reaping is not None:
        if reaping['child'] is not child or saved is None or reaping['saved'] != saved[:4] or not reaping['complete']:
            raise ProcessFailure()
        check(deadline)
        return
    if saved is None:
        raise ProcessFailure()
    leader_current(saved, deadline)
    signal_owned(saved, signal.SIGTERM, deadline)
    term_until = min(deadline, time.monotonic() + .3)
    while live_owned_group(saved[0], deadline) and time.monotonic() < term_until:
        leader_current(saved, deadline)
        time.sleep(.01)
    while live_owned_group(saved[0], deadline):
        signal_owned(saved, signal.SIGKILL, deadline)
        time.sleep(.01)
    # Only now may the leader be reaped. The zombie pins PID/PGID/SID through all signals.
    leader_current(saved, deadline)
    exited = exited_unreaped(child, saved, deadline)
    if exited is None or exited.si_pid != saved[0]:
        raise ProcessFailure()
    if exited.si_code == os.CLD_EXITED and 0 <= exited.si_status <= 255:
        known_status = exited.si_status
    elif exited.si_code in (os.CLD_KILLED, os.CLD_DUMPED) and 0 < exited.si_status < signal.NSIG:
        known_status = -exited.si_status
    else:
        raise ProcessFailure()
    # This is observed WNOWAIT status, NOT cleanup completion. It prevents
    # Popen.__del__ trying a numeric wait if our one reap becomes uncertain.
    child.returncode = known_status
    # No Popen.wait/poll: CPython may retry wait after KeyboardInterrupt and cache
    # a status. Record the one-way boundary BEFORE a single nonblocking syscall.
    reaping = {'child': child, 'saved': saved[:4], 'complete': False}
    REAPING_CHILDREN[id(child)] = reaping
    waited_pid, status = os.waitpid(child.pid, os.WNOHANG)
    if waited_pid != saved[0]:
        raise ProcessFailure()
    if os.waitstatus_to_exitcode(status) != known_status:
        raise ProcessFailure()
    check(deadline)
    reaping['complete'] = True


def run_owned(argv, directory, seconds, serial, whole_deadline=None):
    """Private capped files; inspected cleanup before success or failure returns."""
    if type(argv) is not tuple or not argv or any(type(s) is not str or '\0' in s for s in argv):
        raise ProcessFailure()
    if type(seconds) not in (int, float) or not math.isfinite(seconds) or seconds <= 0 or seconds > 6:
        raise ProcessFailure()
    if UNCERTAIN_CHILDREN:
        raise ProcessFailure()
    if any(not record['complete'] for record in REAPING_CHILDREN.values()):
        raise ProcessFailure()
    if not proc_identity_valid():
        raise ProcessFailure()
    started = time.monotonic()
    deadline = started + seconds + 2
    if whole_deadline is not None:
        if type(whole_deadline) not in (int, float) or not math.isfinite(whole_deadline):
            raise ProcessFailure()
        deadline = min(deadline, whole_deadline)
    check(deadline)
    child, saved = None, None
    cap = 65536
    token = secrets.token_hex(8)
    paths = [directory / ('command-' + token + '-' + str(serial) + suffix) for suffix in ('.out', '.err', '.owner.json')]
    handles = []
    raw = None
    ownership_fd = None
    try:
        for path in paths:
            check(deadline)
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600)
            handles.append(os.fdopen(fd, 'r+b'))
        ownership_fd = handles[2].fileno()

        def limits():
            resource.setrlimit(resource.RLIMIT_FSIZE, (cap, cap))
            # Trusted child captures its exact new session BEFORE exec/use, not after.
            acquired = identity(os.getpid())
            packet = json.dumps({'schema': 'auth-chain-command-owner.v1',
                                 'pid': acquired[0], 'starttime': acquired[1],
                                 'pgid': acquired[2], 'sid': acquired[3]}, separators=(',', ':')).encode()
            offset = 0
            while offset < len(packet):
                n = os.write(ownership_fd, packet[offset:])
                if n <= 0:
                    raise ProcessFailure()
                offset += n
            os.fsync(ownership_fd)
            os.close(ownership_fd)

        def captured():
            check(deadline)
            value = json.loads(os.pread(ownership_fd, 4097, 0).decode('ascii'))
            if type(value) is not dict or set(value) != {'schema', 'pid', 'starttime', 'pgid', 'sid'} or value['schema'] != 'auth-chain-command-owner.v1':
                raise ProcessFailure()
            if any(type(value[k]) is not int or value[k] <= 0 for k in ('pid', 'starttime', 'pgid', 'sid')) or value['pid'] != child.pid or value['pgid'] != child.pid or value['sid'] != child.pid:
                raise ProcessFailure()
            check(deadline)
            return (value['pid'], value['starttime'], value['pgid'], value['sid'], '?')

        child = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=handles[0], stderr=handles[1],
                                 start_new_session=True, preexec_fn=limits, pass_fds=(ownership_fd,))
        UNCERTAIN_CHILDREN[token] = (child, paths[2])
        saved = captured()
        leader_current(saved, deadline)
        if saved[2:4] != (child.pid, child.pid):
            raise ProcessFailure()
        execution_deadline = min(started + seconds, deadline)
        while True:
            value = exited_unreaped(child, saved, deadline)
            if value is not None:
                if value.si_code != os.CLD_EXITED or value.si_status != 0:
                    raise ProcessFailure()
                break
            if time.monotonic() >= execution_deadline:
                raise ProcessFailure()
            time.sleep(.005)
        check(execution_deadline)
        for handle in handles:
            handle.flush()
        if any(path.stat().st_size >= cap for path in paths):
            raise ProcessFailure()
        raw = paths[0].read_bytes()
        check(deadline)
    finally:
        try:
            if child is not None and saved is None:
                # Recover ONLY the trusted pre-exec acquisition record, never guessed IDs.
                saved = captured()
            stop_owned(child, saved, deadline)
            if child is not None:
                check(deadline)
                # Immutable completion companion; pending acquisition alone forbids future cleanup.
                closed = directory / ('command-' + token + '-' + str(serial) + '.closed.json')
                packet = json.dumps({'schema': 'auth-chain-command-closed.v1',
                                     'pid': saved[0], 'starttime': saved[1],
                                     'pgid': saved[2], 'sid': saved[3]}, separators=(',', ':')).encode()
                fd = os.open(closed, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
                try:
                    os.fchmod(fd, 0o600)
                    offset = 0
                    while offset < len(packet):
                        n = os.write(fd, packet[offset:])
                        if n <= 0: raise ProcessFailure()
                        offset += n
                    os.fsync(fd)
                finally:
                    os.close(fd)
                check(deadline)
                UNCERTAIN_CHILDREN.pop(token, None)
        finally:
            for handle in handles:
                handle.close()
    check(deadline)
    return raw
