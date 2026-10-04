"""No Docker/database: rejected environments must never reach psql."""
import os
import pathlib
import subprocess
import tempfile
import unittest

RUNNER = pathlib.Path(__file__).with_name('operations-hired-personnel-native-concurrency.sh')

class HiredNativeGuard(unittest.TestCase):
    def test_hostile_environments_before_database(self):
        with tempfile.TemporaryDirectory() as private:
            root = pathlib.Path(private)
            sentinel = root / 'psql-called'
            fake = root / 'psql'
            fake.write_text('#!/bin/bash\ntouch "$HIRED_GUARD_SENTINEL"\necho PRIVATE_SQL_CONTEXT_SENTINEL >&2\nexit 1\n')
            fake.chmod(0o700)
            base = {'PATH': str(root) + ':/usr/bin:/bin', 'CI': 'true',
                    'EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB': 'true',
                    'PGHOST': '127.0.0.1', 'PGPORT': '5432', 'PGUSER': 'postgres',
                    'PGDATABASE': 'operations_hired_authority_runtime',
                    'HIRED_GUARD_SENTINEL': str(sentinel)}
            hostile = [ {'CI': 'false'}, {'EVENTFLOW_HIRED_PERSONNEL_ISOLATED_DB': 'false'},
                        {'PGHOST': 'remote.example'}, {'PGHOST': 'localhost'},
                        {'PGPORT': '5433'}, {'PGUSER': 'service_role'},
                        {'PGDATABASE': 'postgres'}, {'PGDATABASE': 'operations_hired_authority_runtime_other'},
                        {'PGHOSTADDR': '127.0.0.1'}, {'PGSERVICE': 'ambient'},
                        {'PGSERVICEFILE': '/tmp/ambient'}, {'PGOPTIONS': '-c search_path=public'},
                        {'DATABASE_URL': 'postgres://localhost/postgres'},
                        {'SUPABASE_DB_URL': 'postgres://localhost/postgres'},
                        {'PGDATABASE_URL': 'postgres://localhost/postgres'},
                        {'PGRST_DB_URI': 'postgres://localhost/postgres'},
                        {'SUPABASE_URL': 'https://hosted.example'},
                        {'SUPABASE_SERVICE_ROLE_KEY': 'ambient-secret'}]
            for patch in hostile:
                with self.subTest(keys=list(patch)):
                    result = subprocess.run(['bash', str(RUNNER)], env={**base, **patch},
                                            capture_output=True, timeout=3)
                    self.assertEqual(result.returncode, 2)
                    self.assertFalse(sentinel.exists())
                    self.assertNotIn(b'postgres://', result.stdout + result.stderr)
            # An unexpected initial database error also exposes only a closed label.
            foreign = root / 'foreign-log-dir'
            foreign.mkdir()
            result = subprocess.run(['bash', str(RUNNER)], env={**base, 'task_hired_run_dir': str(foreign)},
                                    capture_output=True, timeout=3)
            self.assertEqual(result.returncode, 2)
            self.assertTrue(sentinel.exists())
            self.assertNotIn(b'PRIVATE_SQL_CONTEXT_SENTINEL', result.stdout + result.stderr)
            self.assertEqual(list(foreign.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
