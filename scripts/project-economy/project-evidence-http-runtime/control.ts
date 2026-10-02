// Fixed disposable identity controls; never a replacement for an application reader.
import { drilldownFixtureGuard, drilldownMutations, drilldownStateSql } from './drilldown-controls.ts';
const database = "eventflow_project_evidence_http_runtime";
const namespace = Deno.env.get("PROJECT_EVIDENCE_COMPOSE_NAMESPACE");
const runId = Deno.env.get("GITHUB_RUN_ID");
const composePath = Deno.env.get("PROJECT_EVIDENCE_COMPOSE_PATH");
const token = Deno.env.get("PROJECT_EVIDENCE_CONTROL_TOKEN");
const jwtSecret = Deno.env.get("PROJECT_EVIDENCE_JWT_SECRET");
if (
  Deno.env.get("CI") !== "true" ||
  Deno.env.get("ISOLATED_PROJECT_EVIDENCE_HTTP") !== "true" ||
  Deno.env.get("GITHUB_REPOSITORY") !== "BillyHamren1/kalender-vyer-mix" ||
  !runId || !/^[0-9]{1,20}$/.test(runId) ||
  namespace !== `project-evidence-http-${runId}` ||
  !composePath ||
  composePath !== new URL("./compose.yml", import.meta.url).pathname ||
  Deno.env.get("PROJECT_EVIDENCE_DATABASE_NAME") !== database ||
  !token || token.length < 32 || !jwtSecret || jwtSecret.length < 32 ||
  token === jwtSecret
) {
  throw new Error("Exact disposable controller boundary required");
}
const guard =
  `if current_database()<>'${database}' then raise exception 'wrong_isolated_database' using errcode='42501';end if;`;
const mutations: Record<string, string> = {
  ...drilldownMutations,
  "move-admin-org":
    "if not exists(select 1 from public.profiles where user_id='00000000-0000-4000-8000-000000000093' and organization_id='00000000-0000-4000-8000-000000000099') or not exists(select 1 from public.user_roles where user_id='00000000-0000-4000-8000-000000000093' and organization_id='00000000-0000-4000-8000-000000000099' and role='admin') or not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000000098' and organization_id='00000000-0000-4000-8000-000000000099' and deleted_at is null) then raise exception 'exact_foreign_fixture_required' using errcode='55000';end if;update public.profiles set organization_id='00000000-0000-4000-8000-000000000099' where user_id='00000000-0000-4000-8000-000000000009' and organization_id='00000000-0000-4000-8000-000000000001';",
  "restore-admin-org":
    "update public.profiles set organization_id='00000000-0000-4000-8000-000000000001' where user_id='00000000-0000-4000-8000-000000000009' and organization_id='00000000-0000-4000-8000-000000000099';",
  "delete-project-a":
    "update public.projects set deleted_at=clock_timestamp() where id='00000000-0000-4000-8000-000000000007' and organization_id='00000000-0000-4000-8000-000000000001' and deleted_at is null;",
  "revoke-admin":
    "delete from public.user_roles where user_id='00000000-0000-4000-8000-000000000009' and organization_id='00000000-0000-4000-8000-000000000001' and role='admin';",
};
const stateSql = `do $$begin ${guard} end;$$;
select json_build_object('databaseName',current_database(),
'cateringPublications',(select count(*) from public.operations_catering_cost_publications),
'cateringObservations',(select count(*) from public.operations_catering_source_observations),
'cateringOutbox',(select count(*) from public.operations_catering_cost_outbox),
'invoiceSnapshots',(select count(*) from public.operations_finance_invoice_snapshots),
'baselines',(select count(*) from public.operations_project_obligation_baselines),
'compositions',(select count(*) from public.operations_scope_obligation_compositions))::text;`;
function fixedSql(operation: string): string {
  if (operation === "state") return stateSql;
  if (operation === "drilldown/state") return drilldownStateSql;
  if (!Object.hasOwn(mutations, operation)) {
    throw new Error("Unknown fixed operation");
  }
  return `begin;do $$declare n integer;begin ${guard} ${operation.startsWith('drilldown/') ? drilldownFixtureGuard : ''} ${
    mutations[operation]
  } get diagnostics n=row_count;if n<>1 then raise exception 'isolated_identity_cas_conflict' using errcode='40001';end if;end;$$;commit;`;
}
async function runSql(operation: string): Promise<unknown> {
  const child = new Deno.Command("docker", {
    args: [
      "compose",
      "--project-directory",
      new URL(".", import.meta.url).pathname,
      "-p",
      namespace!,
      "-f",
      composePath!,
      "exec",
      "-T",
      "-e",
      "PGOPTIONS=-c statement_timeout=3000 -c lock_timeout=1000",
      "database",
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const input = child.stdin.getWriter();
  const output = child.output();
  // Install the deadline before any write/close/read operation can block.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;
  const operationResult = (async () => {
    await input.write(new TextEncoder().encode(fixedSql(operation)));
    await input.close();
    const result = await output;
    completed = true;
    if (
      !result.success || result.stdout.length > 8192 ||
      result.stderr.length > 65536
    ) throw new Error("Owned control failed");
    if (operation === "state" || operation === "drilldown/state") {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(result.stdout).trim(),
      );
    }
    return { status: "accepted", operation };
  })();
  void output.catch(() => {});
  void operationResult.catch(() => {});
  try {
    return await Promise.race([
      operationResult,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // Only our child is killed. Server SQL has its own tighter statement timeout.
          try {
            child.kill("SIGKILL");
          } catch { /* already exited */ }
          void input.abort().catch(() => {});
          reject(new Error("Owned SQL deadline"));
        }, 15_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (!completed) {
      try {
        child.kill("SIGKILL");
      } catch { /* exited */ }
      void input.abort().catch(() => {});
      let reapTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const reaped = await Promise.race([
          Promise.allSettled([output, child.status, operationResult]).then(() =>
            true
          ),
          new Promise<false>((resolve) => {
            reapTimer = setTimeout(() => resolve(false), 2000);
          }),
        ]);
        if (!reaped) throw new Error("Owned SQL cleanup deadline");
      } finally {
        if (reapTimer !== undefined) clearTimeout(reapTimer);
      }
    }
  }
}
async function bodyMatches(request: Request, purpose: string): Promise<boolean> {
  const reader = request.body?.getReader();
  if (!reader) return false;
  let bytes = 0, chunks = 0, expired = false;
  const pieces: Uint8Array[] = [];
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 2000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (expired) return false;
      if (done) break;
      if (++chunks > 32 || (bytes += value.length) > 1024) return false;
      pieces.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const piece of pieces) {
      all.set(piece, offset);
      offset += piece.length;
    }
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(all),
    );
    return !expired && !!value && typeof value === "object" &&
      !Array.isArray(value) && Object.keys(value).length === 1 &&
      value.fixture === purpose;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
const server = Deno.serve({
  hostname: "127.0.0.1",
  port: 55611,
  onListen: () => {},
}, async (request) => {
  const url = new URL(request.url);
  if (
    url.origin !== "http://127.0.0.1:55611" || url.search || url.hash ||
    request.headers.get("x-project-evidence-control-token") !== token
  ) return new Response(null, { status: 403 });
  const operation = url.pathname.slice(1);
  const isState = operation === 'state' || operation === 'drilldown/state';
  if (
    isState
      ? request.method !== "GET" || request.body !== null ||
        (request.headers.has("content-length") &&
          request.headers.get("content-length") !== "0") ||
        request.headers.has("transfer-encoding")
      : request.method !== "POST" || !Object.hasOwn(mutations, operation)
  ) return new Response(null, { status: 400 });
  if (!isState && !await bodyMatches(request, operation.startsWith('drilldown/') ? 'project-evidence-drilldown-http-v1' : 'project-evidence-http-v1')) {
    return new Response(null, { status: 400 });
  }
  try {
    return Response.json(await runSql(operation));
  } catch {
    return Response.json({ status: "denied" }, { status: 409 });
  }
});
await server.finished;
