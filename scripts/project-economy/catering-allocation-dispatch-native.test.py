"""A dispatch fixture cannot inherit a foreign DB or omit its explicit isolated guard."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('dispatch_native', Path(__file__).with_name('catering-allocation-dispatch-native.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class Guards(unittest.TestCase):
    def env(self):
        return dict(CI='true', OPERATIONS_CATERING_ALLOCATION_ISOLATED='1', OPERATIONS_CATERING_DISPATCH_ISOLATED='true', TEST_DATABASE_URL='postgresql://postgres:fixture@127.0.0.1:5432/eventflow_catering_allocation_v2_ci')

    def test_guard_remote_database_and_options_rejected_before_psql(self):
        for changes in [dict(CI='false'), dict(OPERATIONS_CATERING_DISPATCH_ISOLATED='false'), dict(OPERATIONS_CATERING_ALLOCATION_ISOLATED='0'), dict(TEST_DATABASE_URL='postgresql://postgres:fixture@remote.example:5432/eventflow_catering_allocation_v2_ci'), dict(TEST_DATABASE_URL='postgresql://postgres:fixture@127.0.0.1:5432/production'), dict(TEST_DATABASE_URL='postgresql://postgres:fixture@127.0.0.1:5432/eventflow_catering_allocation_v2_ci?host=remote.example')]:
            with self.assertRaises(RuntimeError):
                native.isolated(dict(self.env(), **changes))

    def test_existing_capture_closure_stays_thirteen_and_dispatch_fourteenth_only(self):
        self.assertEqual(len(native.native.SCHEMA_PATHS), 13)
        self.assertNotIn(native.DISPATCH_DDL, native.native.SCHEMA_PATHS)
        self.assertTrue(native.DISPATCH_DDL.endswith('20261002062550_operations_catering_allocation_dispatch_v2.sql'))


if __name__ == '__main__':
    unittest.main()
