import contextlib,hashlib,importlib.util,io,json,pathlib,shutil,tempfile,unittest
import types
from unittest import mock
p=pathlib.Path(__file__).with_name('operations-compatible-full-catalog-native.py');s=importlib.util.spec_from_file_location('runner',p);r=importlib.util.module_from_spec(s);s.loader.exec_module(r)

def environment():return {'CI':'true','EVENTFLOW_COMPATIBLE_FULL_CATALOG_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':r.DATABASE,'PYTHONDONTWRITEBYTECODE':'1','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix','GITHUB_RUN_ID':'1'}

class Guards(unittest.TestCase):
    def test_valid_environment_and_complete_closure(self):
        r.validate_environment(environment());closure=r.load_source();self.assertEqual(len(closure['baseline_schema_paths']),24);self.assertEqual(len(closure['install_paths']),2);self.assertEqual(len(closure['files']),101)
    def test_hostile_environment_refuses_before_module_children(self):
        vectors={'CI':'false','PGHOST':'remote','PGHOSTADDR':'remote','PGDATABASE':'production','PGSERVICE':'foreign','PGOPTIONS':'-c role=attacker','HTTPS_PROXY':'https://foreign','http_proxy':'https://foreign','BASH_ENV':'PRIVATE','ENV':'PRIVATE','PYTHONPATH':'PRIVATE','PYTHONHOME':'PRIVATE','LD_PRELOAD':'PRIVATE','LD_AUDIT':'PRIVATE','DYLD_LIBRARY_PATH':'PRIVATE','BASH_FUNC_child%%':'PRIVATE','GCONV_PATH':'PRIVATE','LOCPATH':'PRIVATE','OPENSSL_CONF':'PRIVATE','OPENSSL_MODULES':'PRIVATE','NODE_OPTIONS':'PRIVATE'}
        with mock.patch.object(r,'module',side_effect=AssertionError('child_called')) as child:
            for key,value in vectors.items():
                with self.subTest(key=key):
                    env=environment();env[key]=value
                    with self.assertRaises(r.ClosedFailure):r.run_native(env)
            child.assert_not_called()
    def test_source_hash_and_order_drift_refused(self):
        closure=r.load_source()
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td)
            for rel in set(closure['files'])|{r.PREFIX+'native-closure.json'}:
                dest=root/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(r.ROOT/rel,dest)
            r.load_source(root)
            path=root/(r.PREFIX+'native-closure.json');value=json.loads(path.read_text());value['baseline_schema_paths'][0:2]=reversed(value['baseline_schema_paths'][0:2]);path.write_text(json.dumps(value))
            with self.assertRaises(r.ClosedFailure):r.load_source(root)
            path.write_text((r.ROOT/(r.PREFIX+'native-closure.json')).read_text());target=root/(r.PREFIX+'read.sql');target.write_text(target.read_text()+'\n')
            with self.assertRaises(r.ClosedFailure):r.load_source(root)
    def test_source_symlink_refused(self):
        closure=r.load_source()
        with tempfile.TemporaryDirectory() as td:
            root=pathlib.Path(td)
            for rel in set(closure['files'])|{r.PREFIX+'native-closure.json'}:
                dest=root/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(r.ROOT/rel,dest)
            path=root/(r.PREFIX+'read.sql');path.unlink();path.symlink_to(r.ROOT/(r.PREFIX+'read.sql'))
            with self.assertRaises(r.ClosedFailure):r.load_source(root)
    def test_exact_source_transactions_not_nested(self):
        closure=r.load_source();first=(r.ROOT/closure['install_paths'][0]).read_text();six=(r.ROOT/closure['install_paths'][1]).read_text()
        self.assertNotRegex(first,r'(?im)^begin;');self.assertRegex(six,r'(?im)^begin;');self.assertRegex(six,r'(?im)^commit;');self.assertNotIn('full_catalog',first);self.assertNotIn('full_catalog',six)
    def test_closed_exception_output_contains_no_private_context(self):
        for error in (FileExistsError('PRIVATE_CONTEXT'),RuntimeError('PRIVATE_CONTEXT'),r.ClosedFailure('private_phase','PRIVATE_CODE')):
            out=io.StringIO()
            with mock.patch.object(r,'run_native',side_effect=error),contextlib.redirect_stdout(out):self.assertEqual(r.main(environment()),1)
            self.assertEqual(out.getvalue(),'operations-compatible-full-catalog-native FAIL guard SQLSTATE=unclassified\n')
    def test_unknown_owned_failure_subclass_no_property_reflection(self):
        calls=[]
        class Hostile(r.ClosedFailure):
            def __init__(self):Exception.__init__(self,'PRIVATE_EXCEPTION')
            @property
            def phase(self):calls.append('phase');raise RuntimeError('PRIVATE_PHASE')
            @property
            def code(self):calls.append('code');raise RuntimeError('PRIVATE_CODE')
            @property
            def __class__(self):calls.append('class');raise RuntimeError('PRIVATE_CLASS')
        out=io.StringIO()
        with mock.patch.object(r,'run_native',side_effect=Hostile()),contextlib.redirect_stdout(out):self.assertEqual(r.main(environment()),1)
        self.assertEqual(calls,[]);self.assertEqual(out.getvalue(),'operations-compatible-full-catalog-native FAIL guard SQLSTATE=unclassified\n')
    def test_real_child_call_unknown_shared_failure_subclass_no_reflection(self):
        atomic=r.module(r.ROOT/r.RUNNER,'guard_frozen_atomic');shared=atomic.shared_module();calls=[]
        class Hostile(shared.ClosedFailure):
            def __init__(self):Exception.__init__(self,'PRIVATE_CHILD')
            @property
            def code(self):calls.append('code');raise RuntimeError('PRIVATE_CHILD_CODE')
            @property
            def __class__(self):calls.append('class');raise RuntimeError('PRIVATE_CHILD_CLASS')
        fake=types.SimpleNamespace(ClosedFailure=shared.ClosedFailure,run_private=mock.Mock(side_effect=Hostile()))
        with tempfile.TemporaryDirectory() as td,mock.patch.object(r,'load_source',return_value={}),mock.patch.object(r,'module',side_effect=[types.SimpleNamespace(shared_module=lambda:fake),types.SimpleNamespace()]),mock.patch.object(r.tempfile,'mkdtemp',return_value=td):
            with self.assertRaises(r.ClosedFailure) as raised:r.run_native(environment())
            self.assertEqual(type(raised.exception),r.ClosedFailure);self.assertEqual(raised.exception.phase,'fresh');self.assertEqual(raised.exception.code,'unclassified')
            fake.run_private.assert_called_once();self.assertEqual(calls,[])
    def test_query_complete_and_no_raw_body_or_config_projection(self):
        query=(r.ROOT/(r.PREFIX+'read.sql')).read_text()
        self.assertNotIn("n.nspname in ('public','auth')",query);self.assertNotIn('to_jsonb(p.proconfig) config,',query);self.assertNotIn('p.prosrc body',query);self.assertIn('pg_shdepend',query);self.assertIn('pg_get_viewdef',query);self.assertIn('extension_membership',query)

if __name__=='__main__':unittest.main()
