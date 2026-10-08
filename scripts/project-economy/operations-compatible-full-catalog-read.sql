-- SELECT-only full finite installed metadata. Runner owns RR/read-only transaction and closed caps.
with funcs as (
 select n.nspname||'.'||p.proname||'('||replace(pg_catalog.oidvectortypes(p.proargtypes),', ',',')||')' identity,
 pg_catalog.pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.prokind::text kind,l.lanname language,
 encode(sha256(convert_to(coalesce(p.probin,''),'UTF8')),'hex') binary_descriptor_sha256,p.prosupport::regprocedure::text support_function,
 p.provolatile::text volatility,p.proisstrict strict,p.proleakproof leakproof,p.proparallel::text parallel,p.proretset set_returning,p.procost::text planner_cost,p.prorows::text planner_rows,
 coalesce((select jsonb_agg(e.extname order by e.extname collate "C") from pg_depend d join pg_extension e on e.oid=d.refobjid where d.classid='pg_proc'::regclass and d.objid=p.oid and d.refclassid='pg_extension'::regclass and d.deptype='e'),'[]'::jsonb) extension_membership,
 exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute,
 encode(sha256(convert_to(coalesce(p.proargdefaults::text,''),'UTF8')),'hex') defaults_sha256,to_jsonb(p.proargmodes) argument_modes,to_jsonb(p.proallargtypes) all_argument_types,to_jsonb(p.protrftypes) transform_types,p.provariadic::regtype::text variadic_type,p.pronargdefaults argument_default_count,
 encode(sha256(convert_to(coalesce(p.prosqlbody::text,''),'UTF8')),'hex') stored_sql_body_sha256,
 pg_catalog.format_type(p.prorettype,null) result_type,coalesce(to_jsonb(p.proargnames),'[]'::jsonb) arg_names,
 encode(sha256(convert_to(coalesce(to_jsonb(p.proconfig),'null'::jsonb)::text,'UTF8')),'hex') config_sha256,encode(sha256(convert_to(coalesce(to_jsonb(p.proacl),'null'::jsonb)::text,'UTF8')),'hex') acl_sha256,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256,
 jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) client_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), schemas as (
 select n.nspname identity,pg_get_userbyid(n.nspowner) owner,encode(sha256(convert_to(coalesce(to_jsonb(n.nspacl),'null'::jsonb)::text,'UTF8')),'hex') acl_sha256,
 jsonb_build_object('anon',has_schema_privilege('anon',n.oid,'USAGE'),'authenticated',has_schema_privilege('authenticated',n.oid,'USAGE'),'service_role',has_schema_privilege('service_role',n.oid,'USAGE')) client_usage,
 jsonb_build_object('anon',has_schema_privilege('anon',n.oid,'CREATE'),'authenticated',has_schema_privilege('authenticated',n.oid,'CREATE'),'service_role',has_schema_privilege('service_role',n.oid,'CREATE')) client_create
 from pg_namespace n where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), relations as (
 select n.nspname||'.'||c.relname identity,c.relkind::text kind,pg_get_userbyid(c.relowner) owner,encode(sha256(convert_to(coalesce(to_jsonb(c.relacl),'null'::jsonb)::text,'UTF8')),'hex') acl_sha256,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.relpersistence::text persistence,encode(sha256(convert_to(case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,false) else '' end,'UTF8')),'hex') definition_sha256,
 encode(sha256(convert_to((to_jsonb(c)-array['oid','relpages','reltuples','relallvisible','relfrozenxid','relminmxid'])::text,'UTF8')),'hex') descriptor_sha256,
 encode(sha256(convert_to(coalesce(to_jsonb(c.reloptions),'null'::jsonb)::text,'UTF8')),'hex') options_sha256,
 coalesce((select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'dropped',a.attisdropped,'identity',a.attidentity,'generated',a.attgenerated,'descriptor_sha256',encode(sha256(convert_to((to_jsonb(a)-array['attrelid','attcacheoff'])::text,'UTF8')),'hex'),
 'acl_sha256',encode(sha256(convert_to(coalesce(to_jsonb(a.attacl),'null'::jsonb)::text,'UTF8')),'hex'),'default_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex')) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0),'[]'::jsonb) columns
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), indices as (
 select n.nspname||'.'||c.relname identity,encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex') definition_sha256,i.indisvalid valid,i.indisready ready,i.indisunique unique_index,encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex') descriptor_sha256
 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), constraints as (
 select n.nspname||'.'||coalesce(c.relname,t.typname)||'.'||k.conname identity,k.convalidated validated,encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex') definition_sha256,encode(sha256(convert_to(to_jsonb(k)::text,'UTF8')),'hex') descriptor_sha256
 from pg_constraint k left join pg_class c on c.oid=k.conrelid left join pg_type t on t.oid=k.contypid join pg_namespace n on n.oid=k.connamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), types as (
 select n.nspname||'.'||t.typname identity,t.typtype::text kind,pg_get_userbyid(t.typowner) owner,encode(sha256(convert_to(coalesce(to_jsonb(t.typacl),'null'::jsonb)::text,'UTF8')),'hex') acl_sha256,encode(sha256(convert_to(jsonb_build_object('type',to_jsonb(t)-'oid','range',coalesce((select jsonb_agg(to_jsonb(r) order by r.rngtypid) from pg_range r where r.rngtypid=t.oid or r.rngmultitypid=t.oid),'[]'::jsonb))::text,'UTF8')),'hex') descriptor_sha256,
 coalesce((select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),'[]'::jsonb) enum_labels
 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), triggers as (
 select n.nspname||'.'||c.relname||'.'||t.tgname identity,t.tgenabled::text enabled,t.tgisinternal internal,
 encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex') definition_sha256,encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') descriptor_sha256 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), policies as (
 select n.nspname||'.'||c.relname||'.'||p.polname identity,p.polcmd::text command,p.polpermissive permissive,encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') descriptor_sha256,
 encode(sha256(convert_to(coalesce(p.polqual::text,'')||'
'||coalesce(p.polwithcheck::text,''),'UTF8')),'hex') expressions_sha256,
 coalesce((select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x) end order by x) from unnest(p.polroles)x),'[]'::jsonb) roles
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
), roles as (
 select r.rolname identity,r.rolsuper superuser,r.rolinherit inherit,r.rolcreaterole create_role,r.rolcreatedb create_db,r.rolcanlogin login,r.rolbypassrls bypass_rls,r.rolreplication replication,r.rolconnlimit connection_limit,
 encode(sha256(convert_to(coalesce(r.rolvaliduntil::text,''),'UTF8')),'hex') validity_sha256,
 encode(sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8')),'hex') config_sha256 from pg_roles r
), memberships as (
 select pg_get_userbyid(m.roleid)||':'||pg_get_userbyid(m.member) identity,pg_get_userbyid(m.grantor) grantor,m.admin_option from pg_auth_members m
), events as (
 select e.evtname identity,e.evtevent event,e.evtenabled::text enabled,pg_get_userbyid(e.evtowner) owner,e.evtfoid::regprocedure::text handler,to_jsonb(e.evttags) tags from pg_event_trigger e
), extensions as (
 select e.extname identity,e.extversion version,pg_get_userbyid(e.extowner) owner,n.nspname namespace,e.extrelocatable relocatable,encode(sha256(convert_to(coalesce(to_jsonb(e.extconfig),'null'::jsonb)::text||':'||coalesce(to_jsonb(e.extcondition),'null'::jsonb)::text,'UTF8')),'hex') configuration_sha256 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
), languages as (
 select l.lanname identity,pg_get_userbyid(l.lanowner) owner,l.lanpltrusted trusted,l.lanispl procedural,l.lanplcallfoid::regprocedure::text handler,l.laninline::regprocedure::text inline_handler,l.lanvalidator::regprocedure::text validator,encode(sha256(convert_to(coalesce(to_jsonb(l.lanacl),'null'::jsonb)::text,'UTF8')),'hex') acl_sha256 from pg_language l
), defaults as (
 select pg_get_userbyid(d.defaclrole)||':'||coalesce(n.nspname,'<global>')||':'||d.defaclobjtype::text identity,encode(sha256(convert_to(to_jsonb(d.defaclacl)::text,'UTF8')),'hex') acl_sha256 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
), dependency_rows as (
 select jsonb_build_array(a.type,a.schema,a.name,a.identity,b.type,b.schema,b.name,b.identity,d.deptype)::text identity,d.deptype::text kind,d.classid::regclass::text source_class,d.refclassid::regclass::text target_class from pg_depend d cross join lateral pg_identify_object(d.classid,d.objid,d.objsubid) a cross join lateral pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid) b where coalesce(a.schema,'') !~ '^pg_(temp|toast_temp)_[0-9]+$' and coalesce(b.schema,'') !~ '^pg_(temp|toast_temp)_[0-9]+$'
), shared_dependency_rows as (
 select jsonb_build_array(a.type,a.schema,a.name,a.identity,b.type,b.schema,b.name,b.identity,d.deptype)::text identity,d.deptype::text kind,d.classid::regclass::text source_class,d.refclassid::regclass::text target_class from pg_shdepend d cross join lateral pg_identify_object(d.classid,d.objid,d.objsubid) a cross join lateral pg_identify_object(d.refclassid,d.refobjid,0) b where d.dbid in (0,(select oid from pg_database where datname=current_database())) and coalesce(a.schema,'') !~ '^pg_(temp|toast_temp)_[0-9]+$'
), dependencies as (select identity,kind,source_class,target_class,count(*) multiplicity from dependency_rows group by identity,kind,source_class,target_class), shared_dependencies as (select identity,kind,source_class,target_class,count(*) multiplicity from shared_dependency_rows group by identity,kind,source_class,target_class),
collations as (
 select n.nspname||'.'||x.collname||':'||x.collencoding::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_collation x join pg_namespace n on n.oid=x.collnamespace
),
conversions as (
 select n.nspname||'.'||x.conname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_conversion x join pg_namespace n on n.oid=x.connamespace
),
operators as (
 select n.nspname||'.'||x.oprname||'('||format_type(x.oprleft,null)||','||format_type(x.oprright,null)||')' identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_operator x join pg_namespace n on n.oid=x.oprnamespace
),
casts as (
 select x.castsource::regtype::text||'->'||x.casttarget::regtype::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_cast x
),
access_methods as (
 select x.amname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_am x
),
operator_families as (
 select n.nspname||'.'||x.opfname||':'||a.amname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_opfamily x join pg_namespace n on n.oid=x.opfnamespace join pg_am a on a.oid=x.opfmethod
),
operator_classes as (
 select n.nspname||'.'||x.opcname||':'||a.amname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_opclass x join pg_namespace n on n.oid=x.opcnamespace join pg_am a on a.oid=x.opcmethod
),
operator_family_members as (
 select 'operator:'||x.oid::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_amop x union all select 'procedure:'||x.oid::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_amproc x
),
aggregates as (
 select x.aggfnoid::regprocedure::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_aggregate x
),
transforms as (
 select x.trftype::regtype::text||':'||l.lanname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_transform x join pg_language l on l.oid=x.trflang
),
foreign_wrappers as (
 select x.fdwname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_foreign_data_wrapper x
),
foreign_servers as (
 select x.srvname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_foreign_server x
),
foreign_tables as (
 select x.ftrelid::regclass::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_foreign_table x
),
user_mappings as (
 select (case when x.umuser=0 then 'PUBLIC' else pg_get_userbyid(x.umuser) end)||':'||s.srvname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_user_mapping x join pg_foreign_server s on s.oid=x.umserver
),
publications as (
 select x.pubname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_publication x
),
publication_relations as (
 select p.pubname||':'||x.prrelid::regclass::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_publication_rel x join pg_publication p on p.oid=x.prpubid
),
publication_schemas as (
 select p.pubname||':'||n.nspname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_publication_namespace x join pg_publication p on p.oid=x.pnpubid join pg_namespace n on n.oid=x.pnnspid
),
subscriptions as (
 select x.subname identity,encode(sha256(convert_to((to_jsonb(x)-'subskiplsn')::text,'UTF8')),'hex') descriptor_sha256 from pg_subscription x where x.subdbid=(select oid from pg_database where datname=current_database())
),
subscription_relations as (
 select s.subname||':'||x.srrelid::regclass::text identity,encode(sha256(convert_to((to_jsonb(x)-'srsublsn')::text,'UTF8')),'hex') descriptor_sha256 from pg_subscription_rel x join pg_subscription s on s.oid=x.srsubid where s.subdbid=(select oid from pg_database where datname=current_database())
),
databases as (
 select x.datname identity,encode(sha256(convert_to((to_jsonb(x)-'datfrozenxid'-'datminmxid')::text,'UTF8')),'hex') descriptor_sha256 from pg_database x
),
tablespaces as (
 select x.spcname identity,encode(sha256(convert_to(to_jsonb(x)::text||':'||pg_tablespace_location(x.oid),'UTF8')),'hex') descriptor_sha256 from pg_tablespace x
),
database_role_settings as (
 select coalesce(d.datname,'<global>')||':'||coalesce(r.rolname,'<global>') identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_db_role_setting x left join pg_database d on d.oid=x.setdatabase left join pg_roles r on r.oid=x.setrole where x.setdatabase in (0,(select oid from pg_database where datname=current_database()))
),
security_labels as (
 select jsonb_build_array(x.classoid::regclass::text,x.objoid,x.objsubid,x.provider)::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_seclabel x
),
shared_security_labels as (
 select jsonb_build_array(x.classoid::regclass::text,x.objoid,x.provider)::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_shseclabel x
),
rewrite_rules as (
 select x.ev_class::regclass::text||':'||x.rulename identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_rewrite x join pg_class c on c.oid=x.ev_class join pg_namespace n on n.oid=c.relnamespace where n.nspname !~ '^pg_(temp|toast_temp)_[0-9]+$'
),
partitioning as (
 select x.partrelid::regclass::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_partitioned_table x
),
inheritance as (
 select x.inhrelid::regclass::text||':'||x.inhparent::regclass::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_inherits x
),
sequence_definitions as (
 select x.seqrelid::regclass::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_sequence x
),
text_search_configs as (
 select n.nspname||'.'||x.cfgname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_ts_config x join pg_namespace n on n.oid=x.cfgnamespace
),
text_search_config_mappings as (
 select x.mapcfg::regconfig::text||':'||x.maptokentype||':'||x.mapseqno identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_ts_config_map x
),
text_search_dictionaries as (
 select n.nspname||'.'||x.dictname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_ts_dict x join pg_namespace n on n.oid=x.dictnamespace
),
text_search_parsers as (
 select n.nspname||'.'||x.prsname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_ts_parser x join pg_namespace n on n.oid=x.prsnamespace
),
text_search_templates as (
 select n.nspname||'.'||x.tmplname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_ts_template x join pg_namespace n on n.oid=x.tmplnamespace
),
large_object_metadata as (
 select x.oid::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_largeobject_metadata x
),
parameter_acls as (
 select x.parname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_parameter_acl x
),
initial_privileges as (
 select jsonb_build_array(x.classoid::regclass::text,x.objoid,x.objsubid,x.privtype)::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_init_privs x
),
extended_statistics as (
 select n.nspname||'.'||x.stxname identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_statistic_ext x join pg_namespace n on n.oid=x.stxnamespace
),
comments as (
 select jsonb_build_array(x.classoid::regclass::text,x.objoid,x.objsubid)::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_description x
),
shared_comments as (
 select jsonb_build_array(x.classoid::regclass::text,x.objoid)::text identity,encode(sha256(convert_to(to_jsonb(x)::text,'UTF8')),'hex') descriptor_sha256 from pg_shdescription x
),
dependency_classes as (
 select classid::regclass::text identity,count(*) multiplicity from (select classid from pg_depend where classid<>0 union all select refclassid from pg_depend union all select classid from pg_shdepend where dbid in (0,(select oid from pg_database where datname=current_database())) union all select refclassid from pg_shdepend where dbid in (0,(select oid from pg_database where datname=current_database()))) q group by classid
)
select jsonb_build_object('schema','operations-compatible-full-catalog-snapshot.v1',
 'functions',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from funcs x),
 'schemas',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from schemas x),
 'relations',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from relations x),
 'indices',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from indices x),
 'constraints',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from constraints x),
 'types',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from types x),
 'triggers',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from triggers x),
 'policies',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from policies x),
 'roles',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from roles x),
 'memberships',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from memberships x),
 'extensions',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from extensions x),
 'languages',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from languages x),
 'defaults',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from defaults x),
 'dependencies',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from dependencies x),
 'shared_dependencies',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from shared_dependencies x),
 'collations',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from collations x),
 'conversions',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from conversions x),
 'operators',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from operators x),
 'casts',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from casts x),
 'access_methods',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from access_methods x),
 'operator_families',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from operator_families x))
 || jsonb_build_object('operator_classes',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from operator_classes x),
 'operator_family_members',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from operator_family_members x),
 'aggregates',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from aggregates x),
 'transforms',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from transforms x),
 'foreign_wrappers',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from foreign_wrappers x),
 'foreign_servers',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from foreign_servers x),
 'foreign_tables',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from foreign_tables x),
 'user_mappings',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from user_mappings x),
 'publications',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from publications x),
 'publication_relations',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from publication_relations x),
 'publication_schemas',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from publication_schemas x),
 'subscriptions',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from subscriptions x),
 'subscription_relations',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from subscription_relations x),
 'databases',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from databases x),
 'tablespaces',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from tablespaces x),
 'database_role_settings',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from database_role_settings x),
 'security_labels',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from security_labels x),
 'shared_security_labels',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from shared_security_labels x),
 'rewrite_rules',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from rewrite_rules x),
 'partitioning',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from partitioning x),
 'inheritance',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from inheritance x),
 'sequence_definitions',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from sequence_definitions x),
 'text_search_configs',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from text_search_configs x),
 'text_search_config_mappings',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from text_search_config_mappings x),
 'text_search_dictionaries',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from text_search_dictionaries x),
 'text_search_parsers',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from text_search_parsers x),
 'text_search_templates',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from text_search_templates x),
 'large_object_metadata',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from large_object_metadata x),
 'parameter_acls',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from parameter_acls x),
 'initial_privileges',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from initial_privileges x),
 'extended_statistics',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from extended_statistics x),
 'comments',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from comments x),
 'shared_comments',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from shared_comments x),
 'dependency_classes',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from dependency_classes x),
 'events',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from events x));
