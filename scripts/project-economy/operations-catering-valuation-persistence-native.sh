#!/usr/bin/env bash
set -Eeuo pipefail

# Synthetic-only native runner. The checked-in admission is deliberately
# blocked until an independently reviewed OCI and publisher evidence chain is
# available. No Docker command may run before admission succeeds.

umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
readonly ADMISSION_PATH="${OPERATIONS_CATERING_IMAGE_ADMISSION_PATH:-$SCRIPT_DIR/operations-catering-valuation-persistence-image-admission.json}"
readonly EVIDENCE_DIR="${OPERATIONS_CATERING_IMAGE_EVIDENCE_DIR:-$SCRIPT_DIR/operations-catering-valuation-persistence-image-evidence}"
readonly SQL_PATH="${OPERATIONS_CATERING_SQL_PATH:-$SCRIPT_DIR/operations-catering-valuation-census-persistence-native-test.sql}"
readonly MIGRATION_PATH="${OPERATIONS_CATERING_MIGRATION_PATH:-$REPO_ROOT/supabase/migrations/20261003120000_operations_catering_valuation_census_persistence_v1.sql}"
readonly EXPECTED_ADMISSION_SHA256="${OPERATIONS_CATERING_EXPECTED_ADMISSION_SHA256:?missing exact admission SHA256}"
readonly EXPECTED_SQL_SHA256="3c8b40425082cbb46bb201220e5028cc384458fd902166c7e5295ef5c8a4dcbe"
readonly EXPECTED_MIGRATION_SHA256="db08d86d39db921b35a53358308ba3afe80872649ffda8b4f55570ee3fbe1166"
readonly EXPECTED_DRIVER_SHA256="095a1587d1809914b747a713fedf26bbda38325e323bfb48f2a9a2f21493682f"
readonly EXPECTED_PLATFORM="linux/amd64"
readonly EXPECTED_POSTGRES_VERSION="postgres (PostgreSQL) 15.19"

refuse() {
  printf '%s\n' "operations_catering_native_refused phase=$1" >&2
  exit 73
}

[[ -n "${RUNNER_TEMP:-}" ]] || refuse runner-temp
[[ "$(uname -s)" == Linux ]] || refuse runner-os
[[ "$(uname -m)" == x86_64 ]] || refuse runner-architecture
[[ -f "$ADMISSION_PATH" && ! -L "$ADMISSION_PATH" ]] || refuse admission-path
[[ -f "$SQL_PATH" && ! -L "$SQL_PATH" ]] || refuse sql-path
[[ -f "$MIGRATION_PATH" && ! -L "$MIGRATION_PATH" ]] || refuse migration-path
admission_output="$(python3 -I -B - "$ADMISSION_PATH" "$EXPECTED_ADMISSION_SHA256" "$EVIDENCE_DIR" <<'PY'
import hashlib, json, os, pathlib, re, stat, sys

def held_bytes(path, cap, expected=None):
    fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise SystemExit(73)
        chunks, total = [], 0
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            total += len(chunk)
            if total > cap:
                raise SystemExit(73)
            chunks.append(chunk)
        raw = b"".join(chunks)
        after = os.fstat(fd)
        current = os.stat(path, follow_symlinks=False)
        identity = lambda s: (
            s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink,
            s.st_size, s.st_mtime_ns, s.st_ctime_ns,
        )
        if identity(before) != identity(after) or identity(after) != identity(current):
            raise SystemExit(73)
        if expected is not None and hashlib.sha256(raw).hexdigest() != expected:
            raise SystemExit(73)
        return raw
    finally:
        os.close(fd)

p = pathlib.Path(sys.argv[1])
raw = held_bytes(p, 65536, sys.argv[2])
if raw.startswith(b"\xef\xbb\xbf"):
    raise SystemExit(73)
value = json.loads(raw)
keys = {
    "schema", "authority", "image", "observed_tag", "platform",
    "observed_index_digest", "observed_platform_manifest_digest",
    "verified_config_digest", "verified_image_id", "verified_entrypoint",
    "verified_cmd", "registry_evidence_bundle_sha256",
    "publisher_signature_bundle_sha256", "trusted_time_bundle_sha256",
    "policy_sha256", "nonclaims",
}
if type(value) is not dict or set(value) != keys:
    raise SystemExit(73)
if value["schema"] != "operations-catering-postgres-image-admission.v1":
    raise SystemExit(73)
if value["authority"] != "verified_registry_publisher_time_chain":
    raise SystemExit(73)
if value["image"] != "docker.io/library/postgres" or value["observed_tag"] != "15.19":
    raise SystemExit(73)
if value["platform"] != {"os": "linux", "architecture": "amd64"}:
    raise SystemExit(73)
digest = re.compile(r"sha256:[0-9a-f]{64}\Z")
plain = re.compile(r"[0-9a-f]{64}\Z")
for key in ("observed_index_digest", "observed_platform_manifest_digest", "verified_config_digest"):
    if type(value[key]) is not str or digest.fullmatch(value[key]) is None:
        raise SystemExit(73)
if type(value["verified_image_id"]) is not str or digest.fullmatch(value["verified_image_id"]) is None:
    raise SystemExit(73)
if value["verified_entrypoint"] != ["docker-entrypoint.sh"] or value["verified_cmd"] != ["postgres"]:
    raise SystemExit(73)
for key in (
    "registry_evidence_bundle_sha256", "publisher_signature_bundle_sha256",
    "trusted_time_bundle_sha256", "policy_sha256",
):
    if type(value[key]) is not str or plain.fullmatch(value[key]) is None:
        raise SystemExit(73)
if type(value["nonclaims"]) is not list or not value["nonclaims"] or any(type(x) is not str for x in value["nonclaims"]):
    raise SystemExit(73)
evidence_dir = pathlib.Path(sys.argv[3])
if evidence_dir.is_symlink() or not evidence_dir.is_dir():
    raise SystemExit(73)
bundle_names = {
    "registry_evidence_bundle_sha256": "registry-oci-chain.json",
    "publisher_signature_bundle_sha256": "publisher-signature.dsse.json",
    "trusted_time_bundle_sha256": "trusted-time.json",
    "policy_sha256": "verification-policy.json",
}
for key, name in bundle_names.items():
    bundle = evidence_dir / name
    if bundle.parent != evidence_dir or bundle.name != name:
        raise SystemExit(73)
    held_bytes(bundle, 1048576, value[key])
# Byte closure alone is never signature/provenance authority. This v3 remains
# deliberately closed until a separately reviewed executable DSSE/OCI verifier
# replaces this fail-closed boundary.
raise SystemExit(73)
print(value["observed_platform_manifest_digest"])
print(value["verified_config_digest"])
print(value["verified_image_id"])
PY
)" || refuse admission-schema
mapfile -t admission <<<"$admission_output"

[[ ${#admission[@]} -eq 3 ]] || refuse admission-output
readonly IMAGE_MANIFEST_DIGEST="${admission[0]}"
readonly CONFIG_DIGEST="${admission[1]}"
readonly IMAGE_ID="${admission[2]}"
readonly IMAGE_REF="docker.io/library/postgres@$IMAGE_MANIFEST_DIGEST"

PRIVATE_ROOT="$(sudo mktemp -d /run/operations-catering-pg.XXXXXXXX)"
readonly PRIVATE_ROOT
[[ "$PRIVATE_ROOT" =~ ^/run/operations-catering-pg\.[A-Za-z0-9]{8}$ ]] || refuse private-root-name
sudo chmod 0700 "$PRIVATE_ROOT"
[[ "$(sudo stat -Lc '%U:%G:%a:%F' "$PRIVATE_ROOT")" == "root:root:700:directory" ]] || refuse private-root
early_retention() {
  local original=$?
  trap - EXIT
  printf '%s\n' "operations_catering_native_evidence_retained" >&2
  exit "$original"
}
trap early_retention EXIT
readonly PRIVATE_ROOT_DEV="$(sudo stat -Lc %d "$PRIVATE_ROOT")"
readonly PRIVATE_ROOT_INO="$(sudo stat -Lc %i "$PRIVATE_ROOT")"
readonly PRIVATE_SOCKET="$PRIVATE_ROOT/docker.sock"
readonly PRIVATE_PIDFILE="$PRIVATE_ROOT/dockerd.pid"
readonly PRIVATE_LOG="$PRIVATE_ROOT/dockerd.log"
readonly PRIVATE_STORE="$PRIVATE_ROOT/docker-store.ext4"
readonly PRIVATE_MOUNT="$PRIVATE_ROOT/store"
readonly PRIVATE_DATA="$PRIVATE_MOUNT/data"
readonly PRIVATE_EXEC="$PRIVATE_MOUNT/exec"
readonly PRIVATE_MIGRATION="$PRIVATE_ROOT/migration.sql"
readonly PRIVATE_SQL="$PRIVATE_ROOT/test.sql"
readonly PRIVATE_DRIVER="$PRIVATE_ROOT/driver.sql"
readonly PRIVATE_ADMISSION="$PRIVATE_ROOT/admission.json"
sudo install -d -m 0700 "$PRIVATE_MOUNT"
readonly PRIVATE_MOUNT_DIR_DEV="$(sudo stat -Lc %d "$PRIVATE_MOUNT")"
readonly PRIVATE_MOUNT_DIR_INO="$(sudo stat -Lc %i "$PRIVATE_MOUNT")"
sudo truncate -s 2147483648 "$PRIVATE_STORE"
sudo mkfs.ext4 -q -F "$PRIVATE_STORE"
sudo mount -o loop,nodev,nosuid "$PRIVATE_STORE" "$PRIVATE_MOUNT"
sudo install -d -m 0700 "$PRIVATE_DATA" "$PRIVATE_EXEC"
readonly PRIVATE_MOUNT_DEV="$(sudo stat -Lc %d "$PRIVATE_MOUNT")"
readonly PRIVATE_MOUNT_INO="$(sudo stat -Lc %i "$PRIVATE_MOUNT")"
readonly PRIVATE_DATA_DEV="$(sudo stat -Lc %d "$PRIVATE_DATA")"
readonly PRIVATE_DATA_INO="$(sudo stat -Lc %i "$PRIVATE_DATA")"
readonly PRIVATE_EXEC_DEV="$(sudo stat -Lc %d "$PRIVATE_EXEC")"
readonly PRIVATE_EXEC_INO="$(sudo stat -Lc %i "$PRIVATE_EXEC")"
sudo python3 -I -B - \
  "$ADMISSION_PATH" "$EXPECTED_ADMISSION_SHA256" "$PRIVATE_ADMISSION" \
  "$MIGRATION_PATH" "$EXPECTED_MIGRATION_SHA256" "$PRIVATE_MIGRATION" \
  "$SQL_PATH" "$EXPECTED_SQL_SHA256" "$PRIVATE_SQL" \
  "$PRIVATE_DRIVER" "$EXPECTED_DRIVER_SHA256" <<'PY'
import hashlib, os, pathlib, stat, sys

triples = [sys.argv[1:4], sys.argv[4:7], sys.argv[7:10]]
held = []
for source, expected, target in triples:
    fd = os.open(source, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
    before = os.fstat(fd)
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
        raise SystemExit(73)
    chunks, total = [], 0
    while True:
        chunk = os.read(fd, 65536)
        if not chunk:
            break
        total += len(chunk)
        if total > 1048576:
            raise SystemExit(73)
        chunks.append(chunk)
    data = b"".join(chunks)
    after = os.fstat(fd)
    current = os.stat(source, follow_symlinks=False)
    identity = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    if identity(before) != identity(after) or identity(after) != identity(current):
        raise SystemExit(73)
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit(73)
    out = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(out, "wb", closefd=True) as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    held.append(data)
    os.close(fd)

include = b"\\ir ../../supabase/migrations/20261003120000_operations_catering_valuation_census_persistence_v1.sql\n"
if held[2].count(include) != 1:
    raise SystemExit(73)
driver = held[1] + b"\n" + held[2].replace(include, b"", 1)
if hashlib.sha256(driver).hexdigest() != sys.argv[11]:
    raise SystemExit(73)
out = os.open(sys.argv[10], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
with os.fdopen(out, "wb", closefd=True) as stream:
    stream.write(driver)
    stream.flush()
    os.fsync(stream.fileno())
os.fsync(os.open(str(pathlib.Path(sys.argv[10]).parent), os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC))
PY

daemon_pid=""
daemon_start=""
daemon_id=""
socket_dev=""
socket_ino=""
container_id=""
image_acquired=false
success=false

proc_start() { awk '{print $22}' "/proc/$1/stat" 2>/dev/null; }
socket_field() { sudo stat -Lc "$1" "$PRIVATE_SOCKET" 2>/dev/null; }

private_root_ok() {
  [[ "$(sudo stat -Lc %d "$PRIVATE_ROOT" 2>/dev/null)" == "$PRIVATE_ROOT_DEV" ]] || return 1
  [[ "$(sudo stat -Lc %i "$PRIVATE_ROOT" 2>/dev/null)" == "$PRIVATE_ROOT_INO" ]] || return 1
  [[ "$(sudo stat -Lc '%U:%G:%a:%F' "$PRIVATE_ROOT" 2>/dev/null)" == "root:root:700:directory" ]] || return 1
}

private_mount_ok() {
  sudo mountpoint -q "$PRIVATE_MOUNT" || return 1
  [[ "$(sudo stat -Lc %d "$PRIVATE_MOUNT" 2>/dev/null)" == "$PRIVATE_MOUNT_DEV" ]] || return 1
  [[ "$(sudo stat -Lc %i "$PRIVATE_MOUNT" 2>/dev/null)" == "$PRIVATE_MOUNT_INO" ]] || return 1
  [[ "$(sudo stat -Lc %d "$PRIVATE_DATA" 2>/dev/null)" == "$PRIVATE_DATA_DEV" ]] || return 1
  [[ "$(sudo stat -Lc %i "$PRIVATE_DATA" 2>/dev/null)" == "$PRIVATE_DATA_INO" ]] || return 1
  [[ "$(sudo stat -Lc %d "$PRIVATE_EXEC" 2>/dev/null)" == "$PRIVATE_EXEC_DEV" ]] || return 1
  [[ "$(sudo stat -Lc %i "$PRIVATE_EXEC" 2>/dev/null)" == "$PRIVATE_EXEC_INO" ]] || return 1
  [[ "$(sudo stat -Lc '%U:%G:%a:%F' "$PRIVATE_DATA" 2>/dev/null)" == "root:root:700:directory" ]] || return 1
  [[ "$(sudo stat -Lc '%U:%G:%a:%F' "$PRIVATE_EXEC" 2>/dev/null)" == "root:root:700:directory" ]] || return 1
}

process_epoch() {
  [[ "$daemon_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$daemon_pid/stat" ]] || refuse daemon-process
  [[ "$(proc_start "$daemon_pid")" == "$daemon_start" ]] || refuse daemon-starttime
  private_root_ok || refuse private-root-identity
  private_mount_ok || refuse private-mount-identity
  sudo test -S "$PRIVATE_SOCKET" || refuse daemon-socket
  sudo test ! -L "$PRIVATE_SOCKET" || refuse daemon-socket
  [[ "$(socket_field %d)" == "$socket_dev" && "$(socket_field %i)" == "$socket_ino" ]] || refuse daemon-socket-identity
}

process_epoch_ok() {
  [[ "$daemon_pid" =~ ^[1-9][0-9]*$ && -r "/proc/$daemon_pid/stat" ]] || return 1
  [[ "$(proc_start "$daemon_pid")" == "$daemon_start" ]] || return 1
  private_root_ok || return 1
  private_mount_ok || return 1
  sudo test -S "$PRIVATE_SOCKET" || return 1
  sudo test ! -L "$PRIVATE_SOCKET" || return 1
  [[ "$(socket_field %d)" == "$socket_dev" && "$(socket_field %i)" == "$socket_ino" ]] || return 1
}

docker_info_id() {
  process_epoch
  sudo timeout --signal=TERM --kill-after=5s 30s env -u DOCKER_CONTEXT -u DOCKER_HOST \
    docker --host "unix://$PRIVATE_SOCKET" info --format '{{.ID}}'
}

docker_exact() {
  local current rc limit=45s
  [[ "${1:-}" == pull ]] && limit=180s
  if [[ "${1:-}" == exec ]]; then
    limit=10s
    [[ " $* " == *" psql "* ]] && limit=120s
  fi
  current="$(docker_info_id)" || refuse daemon-epoch-read
  [[ "$current" == "$daemon_id" ]] || refuse daemon-epoch-change
  process_epoch
  set +e
  sudo timeout --signal=TERM --kill-after=5s "$limit" env -u DOCKER_CONTEXT -u DOCKER_HOST \
    docker --host "unix://$PRIVATE_SOCKET" "$@"
  rc=$?
  set -e
  current="$(docker_info_id)" || refuse daemon-post-epoch-read
  [[ "$current" == "$daemon_id" ]] || refuse daemon-post-epoch-change
  process_epoch
  return "$rc"
}

docker_cleanup() {
  local current
  process_epoch_ok || return 1
  current="$(sudo timeout --signal=TERM --kill-after=5s 30s env -u DOCKER_CONTEXT -u DOCKER_HOST \
    docker --host "unix://$PRIVATE_SOCKET" info --format '{{.ID}}')" || return 1
  [[ "$current" == "$daemon_id" ]] || return 1
  process_epoch_ok || return 1
  sudo timeout --signal=TERM --kill-after=5s 60s env -u DOCKER_CONTEXT -u DOCKER_HOST \
    docker --host "unix://$PRIVATE_SOCKET" "$@" || return 1
  current="$(sudo timeout --signal=TERM --kill-after=5s 30s env -u DOCKER_CONTEXT -u DOCKER_HOST \
    docker --host "unix://$PRIVATE_SOCKET" info --format '{{.ID}}')" || return 1
  [[ "$current" == "$daemon_id" ]] || return 1
  process_epoch_ok
}

cleanup() {
  local original=$?
  set +e
  if [[ -n "$container_id" && -n "$daemon_id" ]]; then
    docker_cleanup container rm --force "$container_id" >/dev/null || original=74
    [[ -z "$(docker_cleanup container ls --all --quiet --no-trunc)" ]] || original=74
    [[ -z "$(docker_cleanup volume ls --quiet)" ]] || original=74
  fi
  if [[ "$image_acquired" == true && -n "$daemon_id" ]]; then
    docker_cleanup image rm "$IMAGE_ID" >/dev/null || original=74
    [[ -z "$(docker_cleanup image ls --all --quiet --no-trunc)" ]] || original=74
  fi
  if [[ -n "$daemon_pid" && -r "/proc/$daemon_pid/stat" ]]; then
    if [[ "$(proc_start "$daemon_pid")" == "$daemon_start" ]]; then
      sudo kill -TERM "$daemon_pid"
      for _ in $(seq 1 100); do
        [[ ! -r "/proc/$daemon_pid/stat" ]] && break
        sleep 0.1
      done
      if [[ -r "/proc/$daemon_pid/stat" && "$(proc_start "$daemon_pid")" == "$daemon_start" ]]; then
        sudo kill -KILL "$daemon_pid"
        for _ in $(seq 1 50); do
          [[ ! -r "/proc/$daemon_pid/stat" ]] && break
          sleep 0.1
        done
      fi
      [[ ! -r "/proc/$daemon_pid/stat" ]] || original=74
    else
      original=74
    fi
  fi
  if [[ "$success" == true && $original -eq 0 ]]; then
    private_root_ok || original=74
    sudo test -f "$PRIVATE_LOG" || original=74
    sudo test ! -L "$PRIVATE_LOG" || original=74
    sudo test ! -e "$PRIVATE_PIDFILE" || original=74
    sudo test ! -L "$PRIVATE_PIDFILE" || original=74
    sudo test ! -e "$PRIVATE_SOCKET" || original=74
    sudo test ! -L "$PRIVATE_SOCKET" || original=74
    private_mount_ok || original=74
    if [[ $original -eq 0 ]]; then
      sudo umount "$PRIVATE_MOUNT" || original=74
    fi
    if [[ $original -eq 0 ]]; then
      [[ "$(sudo stat -Lc %d "$PRIVATE_MOUNT")" == "$PRIVATE_MOUNT_DIR_DEV" ]] || original=74
      [[ "$(sudo stat -Lc %i "$PRIVATE_MOUNT")" == "$PRIVATE_MOUNT_DIR_INO" ]] || original=74
    fi
    if [[ $original -eq 0 ]]; then
      sudo rmdir -- "$PRIVATE_MOUNT" || original=74
    fi
    if [[ $original -eq 0 ]]; then
      sudo python3 -I -B - "$PRIVATE_ROOT" \
        docker-store.ext4 dockerd.log admission.json migration.sql test.sql driver.sql <<'PY' || original=74
import os, stat, sys
root, names = sys.argv[1], sys.argv[2:]
if len(names) != 6 or len(set(names)) != 6:
    raise SystemExit(74)
root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
try:
    root_before = os.fstat(root_fd)
    if not stat.S_ISDIR(root_before.st_mode) or root_before.st_uid != 0 or stat.S_IMODE(root_before.st_mode) != 0o700:
        raise SystemExit(74)
    if set(os.listdir(root_fd)) != set(names):
        raise SystemExit(74)
    held = []
    for name in names:
        if "/" in name or name in ("", ".", ".."):
            raise SystemExit(74)
        fd = os.open(name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=root_fd)
        info = os.fstat(fd)
        path_info = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
        identity = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if identity(info) != identity(path_info) or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise SystemExit(74)
        held.append((name, fd, identity(info)))
    if (root_before.st_dev, root_before.st_ino) != (os.fstat(root_fd).st_dev, os.fstat(root_fd).st_ino):
        raise SystemExit(74)
    # The directory is root-owned 0700 from creation through this held dirfd;
    # the unprivileged runner cannot race any basename below it.
    for name, fd, identity_before in held:
        if identity(os.fstat(fd)) != identity_before:
            raise SystemExit(74)
        os.unlink(name, dir_fd=root_fd)
        if os.fstat(fd).st_nlink != 0:
            raise SystemExit(74)
    os.fsync(root_fd)
    for _, fd, _ in held:
        os.close(fd)
finally:
    os.close(root_fd)
PY
    fi
    if [[ $original -eq 0 ]]; then
      sudo rmdir -- "$PRIVATE_ROOT" || original=74
    fi
    if [[ $original -eq 0 ]]; then
      printf '%s\n' "operations_catering_two_booking_persistence_native PASS postgres15.19 synthetic-only exact-cleanup"
    fi
  fi
  if [[ "$success" != true || $original -ne 0 ]]; then
    printf '%s\n' "operations_catering_native_evidence_retained" >&2
  fi
  exit "$original"
}
trap cleanup EXIT

# A root-owned private daemon root prevents runner-UID pathname/socket swaps and
# avoids adopting or deleting resources from the shared runner daemon.
sudo sh -c 'log=$1; shift; exec dockerd "$@" >"$log" 2>&1' sh "$PRIVATE_LOG" \
  --host="unix://$PRIVATE_SOCKET" \
  --data-root="$PRIVATE_DATA" \
  --exec-root="$PRIVATE_EXEC" \
  --pidfile="$PRIVATE_PIDFILE" \
  --storage-driver=vfs \
  --bridge=none --iptables=false --ip-forward=false --ip-masq=false \
  --userland-proxy=false --log-level=error &

for _ in $(seq 1 200); do
  sudo test -s "$PRIVATE_PIDFILE" && sudo test -S "$PRIVATE_SOCKET" && break
  sleep 0.1
done
sudo test -s "$PRIVATE_PIDFILE" && sudo test -S "$PRIVATE_SOCKET" || refuse daemon-start
daemon_pid="$(sudo cat "$PRIVATE_PIDFILE")"
[[ "$daemon_pid" =~ ^[1-9][0-9]*$ ]] || refuse daemon-pidfile
daemon_start="$(proc_start "$daemon_pid")"
[[ "$daemon_start" =~ ^[1-9][0-9]*$ ]] || refuse daemon-starttime-bind
socket_dev="$(socket_field %d)"
socket_ino="$(socket_field %i)"
[[ "$socket_dev" =~ ^[0-9]+$ && "$socket_ino" =~ ^[1-9][0-9]*$ ]] || refuse daemon-socket-bind
daemon_id="$(docker_info_id)"
[[ "$daemon_id" =~ ^[A-Za-z0-9][A-Za-z0-9:._-]{15,127}$ ]] || refuse daemon-id
[[ "$(docker_exact info --format '{{.OSType}}/{{.Architecture}}')" == "$EXPECTED_PLATFORM" ]] || refuse daemon-platform
[[ -z "$(docker_exact container ls --all --quiet --no-trunc)" ]] || refuse private-daemon-not-empty
[[ -z "$(docker_exact image ls --all --quiet --no-trunc)" ]] || refuse private-daemon-not-empty
[[ -z "$(docker_exact volume ls --quiet)" ]] || refuse private-daemon-not-empty

docker_exact pull --platform "$EXPECTED_PLATFORM" "$IMAGE_REF" >/dev/null || refuse image-pull
image_acquired=true
[[ "$(docker_exact image inspect --format '{{.Id}}' "$IMAGE_REF")" == "$IMAGE_ID" ]] || refuse image-id
[[ "${IMAGE_ID#sha256:}" == "$CONFIG_DIGEST" ]] || refuse image-config-chain
[[ "$(docker_exact image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE_REF")" == "$EXPECTED_PLATFORM" ]] || refuse image-platform
[[ "$(docker_exact image inspect --format '{{json .Config.Entrypoint}}|{{json .Config.Cmd}}' "$IMAGE_REF")" == '["docker-entrypoint.sh"]|["postgres"]' ]] || refuse image-command

container_id="$(docker_exact create \
  --platform "$EXPECTED_PLATFORM" \
  --network none \
  --read-only \
  --memory 805306368 \
  --memory-swap 805306368 \
  --cpus 1.0 \
  --pids-limit 256 \
  --ulimit nofile=1024:1024 \
  --tmpfs /var/lib/postgresql/data:rw,noexec,nosuid,nodev,size=268435456 \
  --tmpfs /var/run/postgresql:rw,noexec,nosuid,nodev,size=16777216 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16777216 \
  -e POSTGRES_PASSWORD=synthetic-test-only \
  -e POSTGRES_DB=operations_catering_valuation_persistence \
  "$IMAGE_ID")"
[[ "$container_id" =~ ^[0-9a-f]{64}$ ]] || refuse container-id
[[ "$(docker_exact container inspect --format '{{.Id}}|{{.Image}}' "$container_id")" == "$container_id|$IMAGE_ID" ]] || refuse container-custody
[[ "$(docker_exact container inspect --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}|{{.HostConfig.NetworkMode}}|{{.HostConfig.ReadonlyRootfs}}' "$container_id")" == '805306368|805306368|1000000000|256|none|true' ]] || refuse container-limits
docker_exact start "$container_id" >/dev/null || refuse container-start

ready=false
for _ in $(seq 1 20); do
  if docker_exact exec "$container_id" pg_isready -U postgres -d operations_catering_valuation_persistence >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.2
done
[[ "$ready" == true ]] || refuse postgres-readiness
[[ "$(docker_exact exec "$container_id" postgres --version)" == "$EXPECTED_POSTGRES_VERSION" ]] || refuse postgres-version
readonly PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=30000'
[[ "$(docker_exact exec -e "PGOPTIONS=$PGOPTIONS" "$container_id" psql -XAt --no-password -U postgres -d operations_catering_valuation_persistence -v ON_ERROR_STOP=1 -c "show statement_timeout; show lock_timeout; show idle_in_transaction_session_timeout;")" == $'30s\n5s\n30s' ]] || refuse postgres-timeouts
sudo timeout --signal=TERM --kill-after=5s 10s cat "$PRIVATE_DRIVER" | \
  docker_exact exec -i -e "PGOPTIONS=$PGOPTIONS" "$container_id" \
    psql -X --no-password -U postgres -d operations_catering_valuation_persistence -v ON_ERROR_STOP=1 || refuse sql-runtime

success=true
