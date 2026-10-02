"""Separate fresh native SQL dispatch proof; all acknowledgement controls are synthetic."""
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('allocation_native', Path(__file__).with_name('catering-allocation-native.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
DISPATCH_DDL = 'supabase/migrations/20261002062550_operations_catering_allocation_dispatch_v2.sql'
MARKER = 'PASS v2 captured capability revocation/tenant/lease-CAS/lost-ack retry/strict receipt/source parked (isolated synthetic receipt controls)'


def isolated(env):
    native.require(env.get('OPERATIONS_CATERING_DISPATCH_ISOLATED') == 'true', 'Separate isolated dispatch guard required')
    return native.isolated_environment(env)


def main():
    env = isolated(os.environ)
    os.umask(0o077)
    observer = native.Session(env, 'dispatch-observer')
    try:
        native.require(observer.execute("select current_database()='" + native.DATABASE + "' and current_user='postgres' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_tables where schemaname not like 'pg_%' and schemaname<>'information_schema');")[-1] == 't', 'Fresh empty disposable schema required')
        for path in [*native.SCHEMA_PATHS, DISPATCH_DDL]:
            source = ROOT / path
            native.require(source.resolve() == source and source.is_file(), 'Exact owned nonsymlink source required')
            observer.execute(source.read_text())
        controls = json.loads(native.run_deno(ROOT, ['run', 'scripts/project-economy/catering-allocation-native-fixture.ts'], env))
        observer.execute("select set_config('test.catering_allocation_fixture'," + native.literal(json.dumps(controls['first'], ensure_ascii=False)) + ",false);")
        authority = (ROOT / 'scripts/project-economy/catering-allocation-authority-postgres-test.sql').read_text()
        boundary = '\nrollback;\n'
        native.require(authority.count(boundary) == 1, 'Exact frozen authority rollback boundary required')
        capture = (ROOT / 'scripts/project-economy/catering-allocation-delivery-postgres-test.sql').read_text()
        dispatch = (ROOT / 'scripts/project-economy/catering-allocation-dispatch-postgres-test.sql').read_text()
        result = observer.execute(authority.replace(boundary, '\n' + capture + '\n' + dispatch + boundary))
        native.require(result.count(MARKER) == 1, 'Complete actual native dispatch controls required')
        native.require(observer.execute('select not exists(select 1 from operations_catering_allocation_private.delivery_queue);')[-1] == 't', 'Synthetic fixture rollback required')
        print('PASS actual native PostgreSQL authority capture dispatch lease-CAS replay revocation and blocked backlog; synthetic receipt controls only')
        print('Genuine Finance allocation-v2 HTTP delivery remains unverified')
    finally:
        observer.close()


if __name__ == '__main__':
    try:
        main()
    except native.SqlFailure as error:
        raise SystemExit('Native dispatch SQL rejected SQLSTATE=' + error.code) from None
    except Exception:
        raise SystemExit('Native dispatch rejected; no acceptance or private output') from None
