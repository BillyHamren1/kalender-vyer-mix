import importlib.util,json,pathlib,unittest
p=pathlib.Path(__file__).with_name('operations-compatible-full-catalog-verify.py')
s=importlib.util.spec_from_file_location('full_catalog_verify',p);v=importlib.util.module_from_spec(s);s.loader.exec_module(v)

def fixture():
    value={'schema':v.SCHEMA,**{key:[] for key in v.SECTIONS}}
    value['functions']=[{'identity':'private.known()','body_sha256':'a'*64}]
    value['relations']=[{'identity':'private.view','definition_sha256':'b'*64}]
    return value

class Controls(unittest.TestCase):
    def test_source_parser_does_not_bridge_sql_standard_body(self):
        source='create function private.standard() returns integer language sql begin atomic select 1;end;create procedure private.known() language sql as $$select 2;$$;'
        bodies=v.source_bodies([source]);self.assertEqual(set(bodies),{'private.known()'})
        self.assertEqual(bodies['private.known()'],v.hashlib.sha256(b'select 2;').hexdigest())
    def test_collation_encoding_collision_retained(self):
        a=fixture();a['collations']=[{'identity':'private.same:-1','descriptor_sha256':'a'*64},{'identity':'private.same:6','descriptor_sha256':'b'*64}]
        observed=v.parse(json.dumps(a));self.assertEqual(len(observed['collations']),2)
        a['collations'][1]['identity']='private.same:-1'
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
    def test_same_count_body_and_view_drift_denied(self):
        for key,field in [('functions','body_sha256'),('relations','definition_sha256')]:
            a=fixture();b=fixture();b[key][0][field]='c'*64
            v.changed(a,b,key,b[key][0]['identity'],field)
            with self.assertRaises(v.Refusal):v.unchanged(a,b)
    def test_same_count_renamed_identity_denied(self):
        a=fixture();b=fixture();b['functions'][0]['identity']='outside.changed()'
        with self.assertRaises(v.Refusal):v.changed(a,b,'functions','private.known()')
    def test_duplicate_json_keys_rows_unsorted_refused(self):
        raw=json.dumps(fixture());v.parse(raw)
        with self.assertRaises(v.Refusal):v.parse(raw.replace('"schema":','"schema":"duplicate","schema":',1))
        a=fixture();a['functions']*=2
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
        a=fixture();a['functions']=[{'identity':'z'},{'identity':'a'}]
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
    def test_secret_fields_and_nonfinite_refused(self):
        for key in v.FORBIDDEN_KEYS:
            a=fixture();a['functions'][0][key]='PRIVATE_VALUE'
            with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
        with self.assertRaises(v.Refusal):v.parse(json.dumps(fixture()).replace('"body_sha256": "'+('a'*64)+'"','"body_sha256": NaN'))
    def test_complete_missing_section_and_cap_refused(self):
        a=fixture();del a['dependencies']
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
    def test_unknown_dependency_class_and_multiplicity_drift_refused(self):
        a=fixture();a['dependencies']=[{'identity':'edge','source_class':'unknown_catalog','target_class':'pg_proc','multiplicity':1}];a['dependency_classes']=[{'identity':'pg_proc','multiplicity':1},{'identity':'unknown_catalog','multiplicity':1}]
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
        a['dependencies'][0]['source_class']='pg_proc';a['dependency_classes']=[{'identity':'pg_proc','multiplicity':1}]
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))
        a['dependency_classes'][0]['multiplicity']=2;v.parse(json.dumps(a))
    def test_source_body_provenance_refuses_same_count_forgery(self):
        source='create function private.known(p_value int default 1) returns integer language sql as $$select 1;$$;'
        bodies=v.source_bodies([source]);self.assertEqual(set(bodies),{'private.known(integer)'})
        a=fixture();a['functions']=[{'identity':'private.known(integer)','body_sha256':next(iter(bodies.values()))}]
        result=v.known_source_provenance(a,bodies);self.assertFalse(result['full_hosted_certificate']);self.assertFalse(result['source_admission'])
        a['functions'][0]['body_sha256']='0'*64
        with self.assertRaises(v.Refusal):v.known_source_provenance(a,bodies)
    def test_extra_acl_role_denied_even_fixed_client_flags_unchanged(self):
        a=fixture();a['functions']=[];b=fixture();spec={'body_sha256':'a'*64,'security_definer':True,'arg_names':[],'result_type':'integer','config':['search_path=""']}
        attrs=v.source_attributes('create function private.new() returns integer language sql as $$select 1;$$;')
        b['functions']=[{'identity':'private.new()','owner':'postgres','body_sha256':'a'*64,'security_definer':True,'arg_names':[],'result_type':'integer','config_sha256':v.pg_array_hash(spec['config']),'client_execute':{'anon':False,'authenticated':False,'service_role':False},'public_execute':False,'acl_sha256':v.pg_array_hash(['postgres=X/postgres','unreviewed=X/postgres']),**attrs['private.new()']}]
        with self.assertRaises(v.Refusal):v.allowed_install(a,b,{'private.new()':spec},None,set(),{},attrs)
    def test_new_routine_all_attributes_derived_and_drift_denied(self):
        source='create function private.new() returns integer language sql as $$select 1;$$;';attrs=v.source_attributes(source)
        a=fixture();a['functions']=[];spec={'body_sha256':'a'*64,'security_definer':True,'arg_names':[],'result_type':'integer','config':['search_path=""']};row={'identity':'private.new()','owner':'postgres','body_sha256':'a'*64,'security_definer':True,'arg_names':[],'result_type':'integer','config_sha256':v.pg_array_hash(spec['config']),'client_execute':{'anon':False,'authenticated':False,'service_role':False},'public_execute':False,'acl_sha256':v.pg_array_hash(['postgres=X/postgres']),**attrs['private.new()']}
        b=fixture();b['functions']=[row];v.allowed_install(a,b,{'private.new()':spec},None,set(),{},attrs)
        for key,value in [('strict',True),('strict',0),('volatility','s'),('defaults_sha256','0'*64),('extension_membership',['unreviewed']),('planner_cost','200'),('planner_rows','1000'),('language','c'),('kind','p'),('support_function','unreviewed()'),('stored_sql_body_sha256','0'*64),('argument_default_count',1),('all_argument_types',[1]),('transform_types',[1]),('variadic_type','integer')]:
            c=fixture();c['functions']=[{**row,key:value}]
            with self.subTest(key=key),self.assertRaises(v.Refusal):v.allowed_install(a,c,{'private.new()':spec},None,set(),{},attrs)
        a=fixture();a['defaults']=[{'identity':str(x)} for x in range(v.ROW_LIMIT+1)]
        with self.assertRaises(v.Refusal):v.parse(json.dumps(a))

if __name__=='__main__':unittest.main()
