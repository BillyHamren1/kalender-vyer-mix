// TEST ONLY: execute exact installed guard blocks, not a copied predicate.
// Generated SQL stays private and never changes the production caller graph.
const stage = Deno.args[0];
const output = Deno.args[1];
try {
  if (
    (stage !== "predecessor" && stage !== "successor") ||
    Deno.args.length !== 2 ||
    !output?.startsWith("/") ||
    output.split("/").at(-1) !== `grant-${stage}-caller-controls.sql`
  )
    throw new Error();
  const parent = output.slice(0, output.lastIndexOf("/"));
  const parentStat = await Deno.lstat(parent);
  if (
    !parentStat.isDirectory ||
    parentStat.isSymlink ||
    (parentStat.mode !== null && (parentStat.mode & 0o077) !== 0)
  )
    throw new Error();
  try {
    await Deno.lstat(output);
    throw new Error();
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw new Error();
  }
  const migration = new URL(
    "../../supabase/migrations/20261002180958_operations_whole_scope_export_grant_v1.sql",
    import.meta.url,
  );
  const stat = await Deno.lstat(migration);
  if (!stat.isFile || stat.isSymlink || stat.size > 131072) throw new Error();
  const source = new TextDecoder("utf-8", { fatal: true }).decode(
    await Deno.readFile(migration),
  );
  const marker =
    stage === "predecessor" ? "do $$begin" : "do $$declare entry oid:=";
  const start = source.indexOf(marker);
  const end = source.indexOf("end;$$;", start);
  if (start < 0 || end < 0 || source.indexOf(marker, start + 1) >= 0)
    throw new Error();
  const guard = source.slice(start, end + "end;$$;".length);
  const message =
    stage === "predecessor"
      ? "installed_grant_compatible_predecessor_required"
      : "installed_grant_static_successor_required";
  if (
    !guard.includes("\\mread_scope_invoice_kernel_compatible_v1\\M") ||
    !guard.includes(message) ||
    (stage === "successor" && !guard.includes("\\mwrite_v1\\M"))
  )
    throw new Error();
  const compatible = [
    '"operations_economy_private"."read_scope_invoice_kernel_compatible_v1"(p)',
    "operations_economy_private.read_scope_invoice_kernel_compatible_v1 /* fixture */ (p)",
    "read_scope_invoice_kernel_compatible_v1(p)",
  ];
  const writer = [
    '"operations_whole_scope_export_grant_private"."write_v1"(p)',
    "operations_whole_scope_export_grant_private.write_v1 /* fixture */ (p)",
    "write_v1(p)",
  ];
  const calls = compatible.map((call) => ({
    call,
    path: "operations_economy_private",
  }));
  if (stage === "successor")
    calls.push(
      ...writer.map((call) => ({
        call,
        path: "operations_whole_scope_export_grant_private",
      })),
    );
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const sql = `begin isolation level repeatable read;
  do $boundary$begin
   if current_database()<>'eventflow_scope_product_publication_runtime' or current_user<>'postgres'
    or current_setting('eventflow.whole_scope_product_publication_isolated',true) is distinct from 'synthetic-disposable'
    or current_setting('test.whole_scope_export_grant_isolated',true) is distinct from 'synthetic-disposable'
    or not (select rolsuper from pg_roles where rolname=current_user)
    or to_regprocedure('public.grant_lexical_hostile_v1(jsonb)') is not null
   then raise exception 'isolated_grant_caller_controls_required' using errcode='22023';end if;
  end;$boundary$;
  create temporary table grant_caller_catalog_before as select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.prosecdef,p.proconfig,p.proacl,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) order by p.oid) from pg_proc p),'namespaces',(select jsonb_agg(jsonb_build_array(n.oid,n.nspname,n.nspowner,n.nspacl) order by n.oid) from pg_namespace n)) as state;
  ${guard}
  ${calls
    .map(({ call, path }) => {
      const ddl = `create function public.grant_lexical_hostile_v1(p jsonb) returns jsonb language plpgsql set search_path='${path}' as $body$begin return ${call};end;$body$;`;
      return `do $control$declare got text;msg text;begin
     begin execute ${literal(ddl)}; execute ${literal(guard)};
     exception when others then get stacked diagnostics got=returned_sqlstate,msg=message_text;end;
     if got is distinct from '55000' or msg is distinct from ${literal(message)}
      or to_regprocedure('public.grant_lexical_hostile_v1(jsonb)') is not null
     then raise exception 'grant_lexical_caller_control_failed' using errcode='22023';end if;
    end;$control$;`;
    })
    .join("\n")}
  ${guard}
  do $neutral$begin
   if (select state from grant_caller_catalog_before) is distinct from jsonb_build_object('functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.prosecdef,p.proconfig,p.proacl,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) order by p.oid) from pg_proc p),'namespaces',(select jsonb_agg(jsonb_build_array(n.oid,n.nspname,n.nspowner,n.nspacl) order by n.oid) from pg_namespace n))
   then raise exception 'grant_caller_catalog_rollback_required' using errcode='22023';end if;
  end;$neutral$;
  rollback;
  `;
  await Deno.writeTextFile(output, sql, { createNew: true, mode: 0o600 });
  console.log(
    `PASS whole_scope_grant_${stage}_caller_controls_generated_private`,
  );
} catch {
  console.error("FAIL whole_scope_grant_caller_controls_closed");
  Deno.exit(1);
}
