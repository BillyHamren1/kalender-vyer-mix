"""Refuse hostile native destinations and partial/private proof before capabilities."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('scope_admin_http', Path(__file__).with_name('operations-scope-invoice-capture-admin-http-native.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class Guards(unittest.TestCase):
    def env(self):
        return dict(CI='true', EVENTFLOW_SCOPE_INVOICE_KERNEL_ISOLATED_DB='true', PGHOST='127.0.0.1', PGPORT='5432', PGDATABASE=native.DATABASE, PGUSER='postgres', PGPASSWORD='synthetic-test-only', GITHUB_RUN_ID='123456')

    def test_destinations_and_libpq_overrides_denied_before_capability(self):
        for key, value in [('CI', 'false'), ('PGHOST', 'remote.example'), ('PGDATABASE', 'production'), ('PGPORT', '6543'), ('PGUSER', 'service_role'), ('PGHOSTADDR', '127.0.0.1'), ('PGSERVICE', 'hosted'), ('PGSERVICEFILE', '/tmp/config'), ('PGOPTIONS', '-c search_path=other'), ('GITHUB_RUN_ID', '../../outside'), ('DOCKER_HOST', 'tcp://remote.example'), ('DOCKER_CONTEXT', 'hosted'), ('DOCKER_CONFIG', '/tmp/remote'), ('COMPOSE_FILE', '/tmp/foreign')]:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                native.isolated(dict(self.env(), **{key: value}))

    def test_exact_proof_rejects_missing_duplicate_private_and_reordered_output(self):
        rows = ['operations-scope-invoice-admin-http PASS ' + c for c in native.CASES] + ['operations-scope-invoice-admin-http PASS TOTAL 14']
        native.proof('\n'.join(rows) + '\n')
        for bad in [rows[:-1], rows + ['private_payload'], rows[:3] + rows[4:], list(reversed(rows)), rows + [rows[0]]]:
            with self.assertRaises(RuntimeError):
                native.proof('\n'.join(bad))


if __name__ == '__main__':
    unittest.main()
