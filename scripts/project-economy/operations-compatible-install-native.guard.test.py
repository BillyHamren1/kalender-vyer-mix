#!/usr/bin/env python3
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import tempfile
import unittest
import uuid
from unittest import mock

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('atomic_install_guard',HERE/'operations-compatible-install-native.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def env():return {'CI':'true','EVENTFLOW_COMPATIBLE_INSTALL_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':m.DATABASE,'PYTHONDONTWRITEBYTECODE':'1','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1234'}

def baseline():
    value={k:[] for k in m.SNAPSHOT_KEYS};value['schema']='operations-compatible-atomic-install-snapshot.v1';value['business']=[];return value

class Guard(unittest.TestCase):
    def test_hostile_env_before_any_child(self):
        cases=[('CI','false'),('PGHOST','database.example'),('PGHOSTADDR','198.51.100.1'),('PGPORT','5433'),('PGDATABASE','production'),('PGSERVICE','remote'),('PGSERVICEFILE','/private/service'),('PGOPTIONS','-c search_path=public'),('PGPASSFILE','/private/password'),('GITHUB_REPOSITORY','other/repo'),('GITHUB_RUN_ID','0'),('PYTHONDONTWRITEBYTECODE','0'),('HTTPS_PROXY','http://remote'),('https_proxy','http://remote'),('ALL_PROXY','http://remote'),('BASH_ENV','/private/script'),('ENV','/private/script'),('PYTHONPATH','/private/python'),('PYTHONHOME','/private/python'),('PYTHONSTARTUP','/private/script'),('NODE_OPTIONS','--require=/private/script'),('LD_PRELOAD','/private/library'),('LD_AUDIT','/private/library'),('DYLD_INSERT_LIBRARIES','/private/library'),('BASH_FUNC_psql%%','caller-code'),('GCONV_PATH','/private/module'),('LOCPATH','/private/module'),('OPENSSL_CONF','/private/config'),('OPENSSL_MODULES','/private/module')]
        for key,value in cases:
            e=env();e[key]=value;out=io.StringIO()
            with mock.patch.object(m,'closure_paths') as closure,mock.patch.object(m,'shared_module') as shared,contextlib.redirect_stdout(out):
                self.assertEqual(m.main(e),1)
            closure.assert_not_called();shared.assert_not_called();self.assertEqual(out.getvalue(),'operations-compatible-install-native FAIL guard SQLSTATE=unclassified\n')

    def test_exact_closure_and_order(self):
        self.assertEqual(len(m.closure_paths()),24)

    def test_fixed_setup_uuid_syntax_and_foreign_project_identity(self):
        setup=(HERE/'operations-compatible-install-native-setup.sql').read_text()
        def validate_constants(source):
            tokens=[value for value in re.findall(r"'([^']*)'",source)
                    if '-' in value and re.fullmatch(r'[a-f0-9-]+',value)]
            self.assertGreaterEqual(len(tokens),16)
            for value in tokens:
                if str(uuid.UUID(value))!=value:raise ValueError('fixed_uuid_syntax')
        validate_constants(setup)
        expected="('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'88888888-8888-4888-8888-888888888888'::uuid)"
        self.assertIn(expected,setup)
        malformed=setup.replace(expected,expected.replace('88888888-8888-4888-8888-888888888888','88888888-8888-4888-888888888888'))
        with self.assertRaises(ValueError):validate_constants(malformed)

    def test_wrong_source_seal_refused(self):
        value=json.loads((HERE/'operations-compatible-install-native-closure.json').read_text())
        value['files'][m.FIRST]='0'*64
        real=m.load_json
        with mock.patch.object(m,'load_json',side_effect=lambda path,phase:value if path.name=='operations-compatible-install-native-closure.json' else real(path,phase)):
            with self.assertRaises(m.ClosedFailure):m.closure_paths()

    def test_wrong_install_order_refused(self):
        value=json.loads((HERE/'operations-compatible-install-native-closure.json').read_text());value['install_paths'].reverse();real=m.load_json
        with mock.patch.object(m,'load_json',side_effect=lambda path,phase:value if path.name=='operations-compatible-install-native-closure.json' else real(path,phase)):
            with self.assertRaises(m.ClosedFailure):m.closure_paths()

    def test_frozen_function_and_transaction_shapes(self):
        first=(m.ROOT/m.FIRST).read_text();six=(m.ROOT/m.SIX).read_text()
        self.assertEqual(len(m.function_specs(first)),7);self.assertEqual(len(m.function_specs(six)),19)
        self.assertFalse(re.search(r'^begin;',first,re.M));self.assertEqual(len(re.findall(r'^begin;',six,re.M)),1);self.assertEqual(len(re.findall(r'^commit;',six,re.M)),1)
        self.assertNotIn('begin;',m.options());self.assertNotIn('commit;',m.options())

    def test_snapshot_statement_can_join_one_readonly_transaction(self):
        full=m.snapshot_sql();statement=m.snapshot_sql(True)
        self.assertEqual(full,'begin isolation level repeatable read read only;\n'+statement+'commit;\n')
        self.assertNotIn('begin isolation',statement);self.assertNotIn('commit;',statement)
        source=(HERE/'operations-compatible-install-native.py').read_text()
        self.assertIn("json.loads(raw[0])!=tables",source);self.assertIn('snapshot_sql(True)',source)

    def test_handler_has_no_conservative_core_or_dynamic_tokens(self):
        setup=(HERE/'operations-compatible-install-native-setup.sql').read_text();body=setup.split('as $handler$',1)[1].split('$handler$;',1)[0]
        tokens=r'\b(?:execute|read_scope_invoice_kernel_v1|read_scope_invoice_capture_admin_v1|read_scope_obligation_evidence_v1|read_scope_obligation_drilldown_v1|read_scope_composition_v1|read_invoice_obligation_kernel_v1|read_obligation_original_v1|read_source_policy_v1)\b'
        self.assertIsNone(re.search(tokens,body,re.I));self.assertIn("errcode='P0001'",body)
        for sha in ('9901a5697bfcb93d4ed8503397b779da7cbfbfa2e3e32b2166f3981af1b0efc1','88c9de651eeb997b598c3e39ac5565af3cdc6a80834e9e1c88bc4dc6582d820b','9cb921fed2f2fd2ec6e6580bce3aebb8fa6efe2955687d7a514f3d51f5b1cbb4'):
            self.assertIn(sha,body)

    def test_metadata_unknown_duplicate_and_overcap_refused(self):
        with self.assertRaises(m.ClosedFailure):m.indexed([{'identity':'same'},{'identity':'same'}])
        with self.assertRaises(m.ClosedFailure):m.indexed([{'identity':str(i)} for i in range(4097)])
        for changed in ({'unknown':[]},{'business':[{'identity':'source','sha256':'changed'}]}):
            before=baseline();after=copy.deepcopy(before);after.update(changed)
            with self.assertRaises(m.ClosedFailure):m.verify_delta(before,after,'',None,{}, {},set())

    def test_unexpected_catalog_schema_change_refused(self):
        before=baseline();after=copy.deepcopy(before);after['schemas']=[{'identity':'unexpected'}]
        with self.assertRaises(m.ClosedFailure):m.verify_delta(before,after,'',None,{}, {},set())

    def test_unknown_exception_private_text_not_public(self):
        calls=[]
        class Hostile(Exception):
            @property
            def __class__(self):calls.append('getter');raise RuntimeError('PRIVATE_GETTER')
        for error in (FileExistsError('PRIVATE_SECRET/path'),Hostile('PRIVATE_SECRET/credential')):
            out=io.StringIO()
            with mock.patch.object(m,'run_native',side_effect=error),contextlib.redirect_stdout(out):self.assertEqual(m.main(env()),1)
            self.assertEqual(out.getvalue(),'operations-compatible-install-native FAIL guard SQLSTATE=unclassified\n')
        self.assertEqual(calls,[])

if __name__=='__main__':
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(Guard)
    stream=io.StringIO();result=unittest.TextTestRunner(stream=stream,verbosity=0).run(suite)
    if result.wasSuccessful():print('operations-compatible-install-guards PASS '+str(result.testsRun));raise SystemExit(0)
    print('operations-compatible-install-guards FAIL');raise SystemExit(1)
