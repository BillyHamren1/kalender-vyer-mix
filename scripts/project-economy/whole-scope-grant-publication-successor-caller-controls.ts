/** TEST-only exact migration DO controls; no installed assertion routine or caller bypass. */
const sourceUrl = new URL(
  "../../supabase/migrations/20261002203540_operations_whole_scope_granted_product_publication_v2.sql",
  import.meta.url,
);
function requireControl(value: unknown): asserts value {
  if (!value) throw new Error("exact_successor_caller_controls_required");
}
function functionDefinition(source: string, signature: string): string {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `create function ${escaped}\\(.*?\\$\\$;`,
    "is",
  ).exec(source);
  requireControl(match);
  return match[0];
}
function changedBody(definition: string): string {
  const changed = definition.replace(
    /^create function/i,
    "create or replace function",
  );
  const end = changed.lastIndexOf("$$;");
  requireControl(end > 0);
  return (
    changed.slice(0, end) +
    "\n-- TEST exact body-seal negative, rolled back\n$$;"
  );
}
function control(
  guard: string,
  mutation: string,
  expectedMessage: string,
): string {
  const delimiters = ["$actual_successor_guard$", "$actual_successor_control$"];
  requireControl(
    delimiters.every((d) => !guard.includes(d) && !mutation.includes(d)),
  );
  return `begin;
do $$begin
 if current_database()<>'eventflow_scope_product_publication_runtime'
 or current_setting('test.whole_scope_granted_publication_isolated',true) is distinct from 'synthetic-disposable'
 or current_user<>'postgres' then raise exception 'isolated_successor_controls_required' using errcode='22023';end if;
end;$$;
create temp table successor_guard_namespace(ignored int);
${guard}
${mutation}
do $actual_successor_control$declare denied boolean:=false;actual_message text;begin
 begin execute $actual_successor_guard$${guard}$actual_successor_guard$;
 exception when sqlstate '55000' then get stacked diagnostics actual_message=message_text;
 if actual_message='${expectedMessage}' then denied:=true;end if;end;
 if not denied then raise exception 'actual_successor_guard_negative_required' using errcode='22023';end if;
end;$actual_successor_control$;
rollback;
`;
}

export async function successorCallerControls(): Promise<{
  predecessor: string;
  successor: string;
}> {
  try {
    const info = await Deno.lstat(sourceUrl);
    requireControl(info.isFile && !info.isSymlink && info.size <= 262144);
    const source = await Deno.readTextFile(sourceUrl);
    const blocks = source.match(/do \$\$begin\n[\s\S]*?end;\$\$;/g);
    requireControl(blocks?.length === 2);
    const [pre, post] = blocks;
    const declaration = (body: string, path = "") =>
      `create function pg_temp.unknown_successor_caller(p jsonb) returns jsonb language plpgsql ${path} as $$begin return ${body};end;$$;`;
    const core =
      "operations_economy_private.read_scope_invoice_kernel_compatible_v1";
    const standardCallers = (callee: string) => [
      `create function pg_temp.unknown_standard_caller(p jsonb) returns jsonb language sql begin atomic select ${callee}(p); end;`,
      `create procedure pg_temp.unknown_standard_procedure(p jsonb) language sql begin atomic select ${callee}(p); end;`,
      `create aggregate pg_temp.unknown_standard_aggregate(*) (sfunc=${callee},stype=jsonb);`,
    ];
    const before = [
      declaration(
        '"operations_economy_private"."read_scope_invoice_kernel_compatible_v1"(p)',
      ),
      declaration(`${core} /* lexical gap */ (p)`),
      declaration(
        "read_scope_invoice_kernel_compatible_v1(p)",
        "set search_path=operations_economy_private",
      ),
    ].map((sql) =>
      control(pre, sql, "installed_granted_publication_predecessor_required"),
    );
    before.push(
      ...standardCallers(core).map((sql) =>
        control(pre, sql, "installed_granted_publication_predecessor_required"),
      ),
    );
    const oldUrl = new URL(
      "../../supabase/migrations/20261002143348_operations_whole_scope_product_publication_v1.sql",
      import.meta.url,
    );
    const oldInfo = await Deno.lstat(oldUrl);
    requireControl(
      oldInfo.isFile && !oldInfo.isSymlink && oldInfo.size <= 262144,
    );
    const old = await Deno.readTextFile(oldUrl);
    before.push(
      control(
        pre,
        changedBody(
          functionDefinition(
            old,
            "operations_whole_scope_publication_private.publish_v1",
          ),
        ),
        "installed_granted_predecessor_bodies_required",
      ),
    );
    before.push(
      control(
        pre,
        "grant execute on function operations_economy_private.read_scope_invoice_kernel_compatible_v1(jsonb) to authenticated;",
        "installed_granted_publication_predecessor_required",
      ),
    );
    const after = [
      declaration(
        '"operations_whole_scope_publication_private"."publish_granted_v2"(p)',
      ),
      declaration(
        "operations_whole_scope_publication_private.publish_granted_v2 /* lexical gap */ (p)",
      ),
      declaration(
        "publish_granted_v2(p)",
        "set search_path=operations_whole_scope_publication_private",
      ),
      declaration(
        '"operations_economy_private"."read_scope_invoice_kernel_compatible_v1"(p)',
      ),
      "grant execute on function operations_whole_scope_publication_private.publish_granted_v2(jsonb) to service_role;",
      "alter function operations_whole_scope_publication_private.publish_granted_v2(jsonb) set search_path=public;",
    ].map((sql) =>
      control(post, sql, "installed_granted_publication_successor_required"),
    );
    after.push(
      ...[
        core,
        "operations_whole_scope_publication_private.publish_granted_v2",
        "operations_whole_scope_export_grant_private.write_v1",
      ]
        .flatMap(standardCallers)
        .map((sql) =>
          control(
            post,
            sql,
            "installed_granted_publication_successor_required",
          ),
        ),
    );
    after.push(
      control(
        post,
        changedBody(
          functionDefinition(
            source,
            "operations_whole_scope_publication_private.publish_granted_v2",
          ),
        ),
        "installed_granted_successor_bodies_required",
      ),
    );
    return { predecessor: before.join("\n"), successor: after.join("\n") };
  } catch {
    throw new Error("exact_successor_caller_controls_required");
  }
}
if (import.meta.main) {
  try {
    requireControl(
      Deno.args.length === 2 &&
        ["predecessor", "successor"].includes(Deno.args[0]) &&
        Deno.args[1].startsWith("/"),
    );
    const controls = await successorCallerControls();
    await Deno.writeTextFile(
      Deno.args[1],
      controls[Deno.args[0] as keyof typeof controls],
      { createNew: true, mode: 0o600 },
    );
    console.log("actual_successor_caller_controls GENERATED private_exact_DO");
  } catch {
    throw new Error("exact_successor_caller_controls_required");
  }
}
