/** NEW root-owned boundary for the finite unlinked cached-auth App case.
 * No provider success, generic proxy, cost command or native certificate. */
const PUBLISHED = 'https://pihrhltinhewhoxefjxv.supabase.co';
const NATIVE = 'http://127.0.0.1:55783';
const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '55555555-5555-4555-8555-555555555555';
const PROJECT_SELECT = '*,booking:bookings(id,large_project_id,client,eventdate,rigdaydate,rigdowndate,deliveryaddress,delivery_city,delivery_postal_code,delivery_latitude,delivery_longitude,contact_name,contact_phone,contact_email,booking_number,carry_more_than_10m,ground_nails_allowed,exact_time_needed,exact_time_info,rental_only,internalnotes)';
const COST_SELECT = 'id,organization_id,staff_day_submission_id,staff_id,staff_name,date,booking_id,project_id,large_project_id,assignment_id,location_id,source_block_id,source_block_kind,source_label,start_at,end_at,minutes,hours,hourly_rate,cost,rate_source,submission_status';
type Rule = { query: readonly (readonly [string, string])[]; single: boolean };
// Exact unchanged809f query families. SDK strips whitespace in select columns.
const RULES: Readonly<Record<string, Rule>> = {
  profiles: { query: [['select', 'organization_id'], ['user_id', `eq.${ACTOR}`]], single: false },
  user_roles: { query: [['select', 'role'], ['user_id', `eq.${ACTOR}`]], single: false },
  projects: { query: [['select', PROJECT_SELECT], ['id', `eq.${PROJECT}`]], single: true },
  project_tasks: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`], ['order', 'sort_order.asc']], single: false },
  project_files: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`], ['order', 'uploaded_at.desc']], single: false },
  project_activity_log: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`], ['order', 'created_at.desc']], single: false },
  project_budget: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`]], single: true },
  project_purchases: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`], ['order', 'created_at.desc']], single: false },
  project_labor_costs: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`], ['order', 'work_date.desc']], single: false },
  project_staff_time_cost_lines: { query: [['select', COST_SELECT], ['or', `(project_id.eq.${PROJECT})`], ['limit', '5000']], single: false },
  product_cost_overrides: { query: [['select', '*'], ['project_id', `eq.${PROJECT}`]], single: false },
  project_billing: { query: [['select', '*'], ['order', 'created_at.desc']], single: false },
};
const deny = (): never => { throw new Error('full_app_get_denied'); };
export function createAppGetAdapter(actorBearer: string, fetcher: typeof fetch = fetch) {
  if (typeof actorBearer !== 'string' || actorBearer.length < 32 || actorBearer.length > 4096 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(actorBearer)) return deny();
  return async (request: Request): Promise<{ table: string; response: Response }> => {
    const url = new URL(request.url);
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
    const rule = table && Object.hasOwn(RULES, table) ? RULES[table] : undefined;
    if (!rule || !table || request.method !== 'GET' || request.body !== null ||
      url.origin !== PUBLISHED || url.hash || url.username || url.password || url.href.length > 8192 ||
      request.headers.get('authorization') !== `Bearer ${actorBearer}` ||
      request.headers.get('accept-profile') !== 'public' ||
      ['prefer', 'range', 'range-unit', 'content-profile'].some(k => request.headers.has(k))) return deny();
    const accept = request.headers.get('accept');
    if (rule.single ? accept !== 'application/vnd.pgrst.object+json' :
      accept !== null && accept !== '*/*' && accept !== 'application/json') return deny();
    const entries = Array.from(url.searchParams.entries());
    if (entries.length !== rule.query.length || entries.some(([k, v], i) =>
      k !== rule.query[i][0] || v !== rule.query[i][1])) return deny();
    const controller = new AbortController(), began = performance.now();
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) abort();
    const timer = setTimeout(abort, 15_000);
    let rejectStop: (error: Error) => void = () => {};
    const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
    void stopped.catch(() => {});
    const signalStop = () => rejectStop(new Error('full_app_get_deadline'));
    controller.signal.addEventListener('abort', signalStop, { once: true });
    if (controller.signal.aborted) signalStop();
    const fresh = () => { if (controller.signal.aborted || performance.now() - began >= 15_000) throw new Error('full_app_get_deadline'); };
    let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const discard = (body: ReadableStream<Uint8Array> | null | undefined) => { if (body) void body.cancel().catch(() => {}); };
    try {
      fresh();
      const headers: Record<string, string> = { authorization: `Bearer ${actorBearer}`, 'accept-profile': 'public' };
      if (accept) headers.accept = accept;
      const pending = fetcher(`${NATIVE}/${table}${url.search}`, {
        method: 'GET', headers, redirect: 'error', signal: controller.signal,
      });
      void pending.then(r => { if (controller.signal.aborted || performance.now() - began >= 15_000) discard(r.body); }, () => {});
      response = await Promise.race([pending, stopped]); fresh();
      const type = response.headers.get('content-type') ?? '';
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type) &&
        !(rule.single && /^application\/vnd\.pgrst\.object\+json(?:\s*;\s*charset=utf-8)?$/i.test(type))) return deny();
      const length = response.headers.get('content-length');
      if (length !== null && (!/^(?:0|[1-9][0-9]*)$/.test(length) || Number(length) > 262144)) return deny();
      if (!response.body) return deny();
      reader = response.body.getReader();
      let bytes = 0, chunks = 0;
      const parts: Uint8Array[] = [];
      while (true) {
        fresh(); const item = await Promise.race([reader.read(), stopped]); fresh();
        if (item.done) break;
        if (++chunks > 4096 || item.value.byteLength > 262144 - bytes) return deny();
        bytes += item.value.byteLength; parts.push(item.value);
      }
      reader.releaseLock(); reader = undefined;
      const body = new Uint8Array(bytes); let offset = 0;
      for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); fresh();
      return { table, response: new Response(body, { status: response.status,
        headers: { 'content-type': type, 'cache-control': 'no-store' } }) };
    } catch {
      // Do not reflect upstream JSON fragments, credential-bearing URLs or errors.
      if (controller.signal.aborted || performance.now() - began >= 15_000) throw new Error('full_app_get_deadline');
      return deny();
    } finally {
      clearTimeout(timer); request.signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', signalStop);
      if (reader) void reader.cancel().catch(() => {}); else discard(response?.body);
    }
  };
}
