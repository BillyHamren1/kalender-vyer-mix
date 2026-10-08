"""Strict metadata comparison for the complete finite disposable installation."""
import hashlib
import json
import re

SECTIONS = ('functions','schemas','relations','indices','constraints','types','triggers','policies','roles','memberships','events','extensions','languages','defaults','dependencies','shared_dependencies')
SECTIONS += ('collations', 'conversions', 'operators', 'casts', 'access_methods', 'operator_families', 'operator_classes', 'operator_family_members', 'aggregates', 'transforms', 'foreign_wrappers', 'foreign_servers', 'foreign_tables', 'user_mappings', 'publications', 'publication_relations', 'publication_schemas', 'subscriptions', 'subscription_relations', 'databases', 'tablespaces', 'database_role_settings', 'security_labels', 'shared_security_labels', 'rewrite_rules', 'partitioning', 'inheritance', 'sequence_definitions')
SECTIONS += ('text_search_configs', 'text_search_config_mappings', 'text_search_dictionaries', 'text_search_parsers', 'text_search_templates', 'large_object_metadata', 'parameter_acls', 'initial_privileges', 'extended_statistics', 'comments', 'shared_comments', 'dependency_classes')
LIMIT = 8 * 1024 * 1024
ROW_LIMIT = 100000
SCHEMA = 'operations-compatible-full-catalog-snapshot.v1'
SUPPORTED_CLASSES={'pg_proc','pg_class','pg_type','pg_namespace','pg_authid','pg_database','pg_tablespace','pg_language','pg_extension','pg_constraint','pg_attrdef','pg_policy','pg_trigger','pg_rewrite','pg_operator','pg_cast','pg_conversion','pg_collation','pg_am','pg_opfamily','pg_opclass','pg_amop','pg_amproc','pg_aggregate','pg_transform','pg_foreign_data_wrapper','pg_foreign_server','pg_user_mapping','pg_publication','pg_publication_rel','pg_publication_namespace','pg_subscription','pg_subscription_rel','pg_default_acl','pg_event_trigger','pg_ts_config','pg_ts_dict','pg_ts_parser','pg_ts_template','pg_largeobject_metadata','pg_parameter_acl','pg_statistic_ext'}
FORBIDDEN_KEYS = {'prosrc','definition','config','password','rolpassword','body','sql','jwt','secret','connection_string'}

class Refusal(Exception):
    def __init__(self): super().__init__('closed_full_catalog_refusal')

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def pg_array_hash(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(', ',': ')).encode()).hexdigest()

def parse(raw):
    if type(raw) is not str: raise Refusal()
    try:
        if len(raw.encode()) > LIMIT: raise ValueError()
        def unique(pairs):
            result={}
            for key,value in pairs:
                if key in result: raise ValueError()
                result[key]=value
            return result
        value=json.loads(raw,object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if type(value) is not dict or set(value)!={'schema',*SECTIONS} or value['schema']!=SCHEMA: raise ValueError()
        def inspect(item):
            if type(item) is dict:
                if FORBIDDEN_KEYS & set(item): raise ValueError()
                for nested in item.values(): inspect(nested)
            elif type(item) is list:
                for nested in item: inspect(nested)
            elif item is not None and type(item) not in (str,bool,int): raise ValueError()
        inspect(value)
        for section in SECTIONS:
            rows=value[section]
            if type(rows) is not list or len(rows)>ROW_LIMIT: raise ValueError()
            keys=[]
            for row in rows:
                if type(row) is not dict or type(row.get('identity')) is not str or not row['identity'] or len(row['identity'].encode())>32768: raise ValueError()
                keys.append(row['identity'])
                if section in {'dependencies','shared_dependencies'} and (type(row.get('multiplicity')) is not int or row['multiplicity']<1): raise ValueError()
            if len(set(keys))!=len(keys) or keys!=sorted(keys,key=lambda x:x.encode()): raise ValueError()
        class_counts={}
        for section in ('dependencies','shared_dependencies'):
            for row in value[section]:
                for key in ('source_class','target_class'):
                    name=row.get(key)
                    if type(name) is not str or name not in SUPPORTED_CLASSES:raise ValueError()
                    class_counts[name]=class_counts.get(name,0)+row['multiplicity']
        observed={row['identity']:row.get('multiplicity') for row in value['dependency_classes']}
        if observed!=class_counts:raise ValueError()
        return value
    except Exception: raise Refusal() from None

def indexed(rows): return {row['identity']:row for row in rows}

def unchanged(before,after):
    if before != after: raise Refusal()

def source_bodies(sources):
    result={}
    pattern=r'\bcreate(?: or replace)? (?:function|procedure) ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(([^();]*)\)\s+([^;]*?)\bas (\$[a-z_]*\$)(.*?)\4;'
    for source in sources:
        for match in re.finditer(pattern,source,re.S|re.I):
            name,args,header,tag,body=match.groups();types=[]
            for field in args.split(','):
                if not field.strip():continue
                tokens=field.strip().split()
                if len(tokens)<2 or tokens[0].lower() in {'in','out','inout','variadic'}:raise Refusal()
                if len(tokens)>2 and tokens[2].lower()!='default':raise Refusal()
                types.append({'int':'integer','int4':'integer','int8':'bigint','bool':'boolean'}.get(tokens[1],tokens[1]))
            result[name+'('+','.join(types)+')']=hashlib.sha256(body.encode()).hexdigest()
    return result

def known_source_provenance(metadata,bodies):
    installed=indexed(metadata['functions'])
    if not bodies:raise Refusal()
    for identity,sha in bodies.items():
        if identity not in installed or installed[identity]['body_sha256']!=sha:raise Refusal()
    # This finite known body map never authorizes unverified builtin/extension/
    # provider or dynamic dispatch; every other installed identity is retained.
    return {'verified_source_bodies':len(bodies),'unresolved_installed_bodies':len(set(installed)-set(bodies)),'full_hosted_certificate':False,'source_admission':False}

def source_attributes(source):
    result={};pattern=r'\bcreate(?: or replace)? function ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\(([^();]*)\)\s+returns([^;]*?)\bas (\$[a-z_]*\$)(.*?)\4;'
    empty=hashlib.sha256(b'').hexdigest()
    for match in re.finditer(pattern,source,re.S|re.I):
        name,args,header,tag,body=match.groups();fields=[field.strip().split() for field in args.split(',') if field.strip()]
        if any(len(field)!=2 for field in fields) or re.search(r'\bsupport\b|\btransform\b',header,re.I):raise Refusal()
        language=re.search(r'\blanguage\s+(sql|plpgsql)\b',header,re.I)
        if not language:raise Refusal()
        identity=name+'('+','.join(field[1] for field in fields)+')'
        if re.search(r'\bcost\b|\brows\b',header,re.I):raise Refusal()
        result[identity]={'language':language.group(1).lower(),'kind':'f','strict':bool(re.search(r'\bstrict\b|\breturns null on null input\b',header,re.I)),
            'volatility':'i' if re.search(r'\bimmutable\b',header,re.I) else 's' if re.search(r'\bstable\b',header,re.I) else 'v',
            'parallel':'s' if re.search(r'\bparallel safe\b',header,re.I) else 'r' if re.search(r'\bparallel restricted\b',header,re.I) else 'u',
            'leakproof':bool(re.search(r'(?<!not )\bleakproof\b',header,re.I)),'defaults_sha256':empty,'set_returning':bool(re.search(r'^\s*(setof|table)\b',header,re.I)),
            'argument_modes':None,'all_argument_types':None,'transform_types':None,'variadic_type':'-','argument_default_count':0,'stored_sql_body_sha256':empty,'support_function':'-','extension_membership':[],'binary_descriptor_sha256':empty,'planner_cost':'100','planner_rows':'1000' if re.search(r'^\s*(setof|table)\b',header,re.I) else '0'}
    return result

def changed(before,after,section,identity,field=None):
    if section not in SECTIONS: raise Refusal()
    old=indexed(before[section]);new=indexed(after[section])
    if identity not in old or identity not in new or len(old)!=len(new): raise Refusal()
    if field:
        if old[identity].get(field)==new[identity].get(field): raise Refusal()
    elif old[identity]==new[identity]: raise Refusal()
    if before==after: raise Refusal()

def allowed_install(before,after,specs,namespace,old_cores,public_roles,attributes=None):
    """Source-derived routine semantics plus exact whole-inventory outside delta."""
    old=indexed(before['functions']);new=indexed(after['functions'])
    additions=set(specs)-set(old)
    if type(attributes) is not dict or set(attributes)!=set(specs):raise Refusal()
    if set(new)-set(old)!=additions or set(old)-set(new): raise Refusal()
    allow=set(specs)|set(old_cores)
    for identity,row in old.items():
        if identity not in allow and row!=new[identity]: raise Refusal()
    for identity,spec in specs.items():
        row=new[identity]
        if any(type(row.get(key)) is not type(value) or row.get(key)!=value for key,value in attributes[identity].items()):raise Refusal()
        if row['owner']!='postgres' or row['body_sha256']!=spec['body_sha256'] or row['security_definer']!=spec['security_definer'] or row['arg_names']!=spec['arg_names'] or row['result_type']!=spec['result_type']: raise Refusal()
        # PostgreSQL JSONB array serialization is retained exactly for fixed ASCII configuration.
        expected_config=pg_array_hash(spec['config'])
        if row['config_sha256']!=expected_config: raise Refusal()
        expected_role=public_roles.get(identity)
        if row['client_execute']!={role:role==expected_role for role in ('anon','authenticated','service_role')}: raise Refusal()
        if row['public_execute'] or row['acl_sha256']!=pg_array_hash(['postgres=X/postgres']+([expected_role+'=X/postgres'] if expected_role else [])):raise Refusal()
        if identity in old:
            if any(old[identity][key]!=row[key] for key in row if key not in {'body_sha256','config_sha256','acl_sha256','client_execute'}): raise Refusal()
    for identity in old_cores:
        row=new[identity]
        if row['acl_sha256']!=pg_array_hash(['postgres=X/postgres']) or any(row['client_execute'].values()) or any(old[identity][key]!=row[key] for key in row if key not in {'acl_sha256','client_execute'}): raise Refusal()
    schemas_old=indexed(before['schemas']);schemas_new=indexed(after['schemas'])
    if set(schemas_new)-set(schemas_old)!=({namespace} if namespace else set()) or set(schemas_old)-set(schemas_new): raise Refusal()
    if any(row!=schemas_new[key] for key,row in schemas_old.items()): raise Refusal()
    if namespace:
        row=schemas_new[namespace]
        if row['owner']!='postgres' or row['client_usage']!={'anon':False,'authenticated':True,'service_role':True} or any(row['client_create'].values()): raise Refusal()
        if row['acl_sha256']!=pg_array_hash(['postgres=UC/postgres','authenticated=U/postgres','service_role=U/postgres']):raise Refusal()
    for section in SECTIONS:
        if section in {'functions','schemas','dependencies','shared_dependencies','dependency_classes'}: continue
        unchanged(before[section],after[section])
    # Catalog dependencies aren't executable PL/pgSQL call-graph authority. Their
    # changed sources must be the exact source-derived installation objects.
    for section in ('dependencies','shared_dependencies'):
        a=indexed(before[section]);b=indexed(after[section])
        for key in set(a)|set(b):
            if a.get(key)==b.get(key): continue
            try: address=json.loads(key)
            except Exception: raise Refusal() from None
            if type(address) is not list or len(address)!=9: raise Refusal()
            source=address[3]
            if type(source) is not str: raise Refusal()
            source=re.sub(r'(?<=[(,])pg_catalog\.(uuid|jsonb|text|integer|bigint|boolean)(?=[,)])',r'\1',source.replace(', ',','))
            if source not in allow and not (address[0]=='schema' and source==namespace): raise Refusal()
