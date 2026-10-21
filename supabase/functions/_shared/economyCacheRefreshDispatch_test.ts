import { dispatchEconomyCacheRefresh, economyRefreshBookingIds } from './economyCacheRefreshDispatch.ts';

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const BOOKING_A = '8e16aa4d-d865-4b02-b648-f43cbe2b1a5a';
const BOOKING_B = '4a31f877-227c-40e2-b222-f171e401d23a';

Deno.test('refreshes the single booking when its source revision is already current', () => {
  // The importer has no changed booking rows in this path; the source economics
  // may still have changed independently (for example a corrected invoice).
  assertEquals(economyRefreshBookingIds({
    organizationId: 'org-1',
    isDryRun: false,
    singleBookingId: BOOKING_A,
    changedBookingIds: [],
  }), [BOOKING_A]);
});

Deno.test('does not refresh during dry runs or without an organization', () => {
  assertEquals(economyRefreshBookingIds({
    organizationId: 'org-1', isDryRun: true, singleBookingId: BOOKING_A,
  }), []);
  assertEquals(economyRefreshBookingIds({
    organizationId: null, isDryRun: false, singleBookingId: BOOKING_A,
  }), []);
});

Deno.test('dispatches only the affected tenant booking once', async () => {
  const calls: unknown[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push([String(url), init?.method, init?.headers, JSON.parse(String(init?.body))]);
    return new Response(null, { status: 200 });
  };

  await dispatchEconomyCacheRefresh({
    supabaseUrl: 'https://ops.example/',
    serviceRoleKey: 'test-key',
    organizationId: 'org-1',
    bookingIds: [BOOKING_A, BOOKING_A, 'invalid'],
    fetcher,
  });

  assertEquals(calls, [[
    'https://ops.example/functions/v1/refresh-economy-cache',
    'POST',
    { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
    { organization_id: 'org-1', booking_ids: [BOOKING_A] },
  ]]);
});

Deno.test('dispatches corrections for each distinct affected booking only', async () => {
  let payload: unknown;
  await dispatchEconomyCacheRefresh({
    supabaseUrl: 'https://ops.example',
    serviceRoleKey: 'test-key',
    organizationId: 'org-2',
    bookingIds: [BOOKING_B, BOOKING_A, BOOKING_B],
    fetcher: async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    },
  });
  assertEquals(payload, { organization_id: 'org-2', booking_ids: [BOOKING_B, BOOKING_A] });
});

Deno.test('contains and logs HTTP and network errors without rejecting the source write', async () => {
  const logs: unknown[] = [];
  const logger = { warn: (...args: unknown[]) => logs.push(args) };
  await dispatchEconomyCacheRefresh({
    supabaseUrl: 'https://ops.example',
    serviceRoleKey: 'test-key',
    organizationId: 'org-1',
    bookingIds: [BOOKING_A],
    fetcher: async () => new Response(null, { status: 503 }),
    logger,
  });
  await dispatchEconomyCacheRefresh({
    supabaseUrl: 'https://ops.example',
    serviceRoleKey: 'test-key',
    organizationId: 'org-1',
    bookingIds: [BOOKING_A],
    fetcher: async () => { throw new Error('offline'); },
    logger,
  });
  assertEquals(logs.length, 2);
});

Deno.test('does not dispatch without tenant configuration or valid affected booking IDs', () => {
  const fetcher = async () => { throw new Error('must not fetch'); };
  assertEquals(dispatchEconomyCacheRefresh({
    supabaseUrl: 'https://ops.example', serviceRoleKey: 'k', organizationId: null,
    bookingIds: [BOOKING_A], fetcher,
  }), null);
  assertEquals(dispatchEconomyCacheRefresh({
    supabaseUrl: 'https://ops.example', serviceRoleKey: 'k', organizationId: 'org-1',
    bookingIds: ['invalid'], fetcher,
  }), null);
});
