#!/usr/bin/env python3
"""No network/database access: hostile native URL and fresh-CI guard controls."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("allocation_native", Path(__file__).with_name("catering-allocation-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


class NativeGuardTests(unittest.TestCase):
    def env(self, url="postgresql://postgres:fixture@127.0.0.1:5432/eventflow_catering_allocation_v2_ci"):
        return {"CI": "true", "OPERATIONS_CATERING_ALLOCATION_ISOLATED": "1", "TEST_DATABASE_URL": url}

    def test_explicit_loopback_exact_database(self):
        self.assertEqual(native.isolated_environment(self.env())["PGDATABASE"], native.DATABASE)

    def test_remote_host_with_embedded_localhost_path_is_denied(self):
        with self.assertRaises(RuntimeError):
            native.isolated_environment(self.env("postgresql://postgres:fixture@remote.example:5432/path@localhost:5432/eventflow_catering_allocation_v2_ci"))

    def test_remote_userinfo_trick_is_denied(self):
        with self.assertRaises(RuntimeError):
            native.isolated_environment(self.env("postgresql://postgres:localhost:5432@remote.example:5432/eventflow_catering_allocation_v2_ci"))

    def test_database_port_and_service_query_must_be_exact(self):
        for url in ["postgresql://postgres:p@localhost:5432/production", "postgresql://postgres:p@localhost:6543/eventflow_catering_allocation_v2_ci", "postgresql://postgres:p@localhost:5432/eventflow_catering_allocation_v2_ci?host=remote.example", "postgresql://postgres:p@localhost:5432/eventflow_catering_allocation_v2_ci#suffix"]:
            with self.assertRaises(RuntimeError):
                native.isolated_environment(self.env(url))

    def test_both_flags_mandatory(self):
        for field in ["CI", "OPERATIONS_CATERING_ALLOCATION_ISOLATED"]:
            env = self.env();del env[field]
            with self.assertRaises(RuntimeError):
                native.isolated_environment(env)

    def test_libpq_overrides_removed_from_owned_child(self):
        env = self.env();env.update(PGHOSTADDR="198.51.100.1", PGSERVICE="hosted", PGSERVICEFILE="/tmp/hosted", PGOPTIONS="-c search_path=other", PGPASSWORD="unrelated")
        child = native.isolated_environment(env)
        self.assertEqual(child["PGHOST"], "127.0.0.1")
        self.assertEqual(child["PGPASSWORD"], "fixture")
        for key in ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"]:
            self.assertNotIn(key, child)

    def test_schema_has_exact_twelve_ordered_sources_and_no_capture_endpoint(self):
        self.assertEqual(len(native.SCHEMA_PATHS), 12)
        self.assertEqual(len(set(native.SCHEMA_PATHS)), 12)
        self.assertTrue(native.SCHEMA_PATHS[-1].endswith("allocation_authority_v2.sql"))
        self.assertFalse(any("allocation_delivery" in p for p in native.SCHEMA_PATHS))


if __name__ == "__main__":
    unittest.main()
