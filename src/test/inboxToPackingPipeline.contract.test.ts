// @vitest-environment node
/**
 * Contract test for the OFFICIAL inbox → packing pipeline.
 *
 * Locks the rules in mem://constraints/single-inbox-to-packing-pipeline-v1:
 *   1. Booking in → exactly one packlista skapas korrekt
 *   2. Same booking dubbeklickas → ingen dubbel packlista (re-link, not re-create)
 *   3. Sync failar → tydlig failed state + warehouse_project rullas tillbaka
 *   4. Large project med flera bookings → EN consolidated packlista
 *   5. Artiklar från alla bookings synkas in i samma packing_id (target_packing_id)
 *   6. Legacy/parallell väg blockeras — inbox markeras converted först efter sync OK
 *   7. UI får inte success förrän hela pipelinen är klar (createWarehouseProjectFromInbox
 *      returnerar wp endast vid full success; kastar annars)
 *
 * The Supabase client is mocked with a small in-memory fake. The
 * sync-booking-to-packing edge function is mocked at the service layer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory fake DB
// ---------------------------------------------------------------------------
type Row = Record<string, any>;
interface FakeDB {
  warehouse_projects: Row[];
  warehouse_project_tasks: Row[];
  warehouse_project_inbox: Row[];
  projects: Row[];
  bookings: Row[];
  large_projects: Row[];
  large_project_bookings: Row[];
  packing_projects: Row[];
  packing_project_bookings: Row[];
  packing_list_items: Row[];
  booking_products: Row[];
}

let db: FakeDB;
let nextId = 1;
const newId = (prefix = 'id') => `${prefix}-${nextId++}`;

const resetDb = () => {
  nextId = 1;
  db = {
    warehouse_projects: [],
    warehouse_project_tasks: [],
    warehouse_project_inbox: [],
    projects: [],
    bookings: [],
    large_projects: [],
    large_project_bookings: [],
    packing_projects: [],
    packing_project_bookings: [],
    packing_list_items: [],
    booking_products: [],
  };
};

// ---------------------------------------------------------------------------
// Tiny supabase-like query builder over the fake DB
// ---------------------------------------------------------------------------
type Filter = { col: string; op: 'eq' | 'in' | 'is'; val: any };

const matchRow = (row: Row, filters: Filter[]) =>
  filters.every((f) => {
    const v = row[f.col];
    if (f.op === 'eq') return v === f.val;
    if (f.op === 'in') return Array.isArray(f.val) && f.val.includes(v);
    // Postgres `IS NULL` semantics: missing/undefined columns count as null.
    if (f.op === 'is') return f.val === null ? v === null || v === undefined : v === f.val;
    return false;
  });

const makeBuilder = (table: keyof FakeDB) => {
  const filters: Filter[] = [];
  let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: any = null;
  let selectCols = '*';
  let countMode: 'exact' | null = null;
  let head = false;

  const exec = () => {
    const rows = db[table];
    if (mode === 'insert') {
      const items = Array.isArray(payload) ? payload : [payload];
      const inserted: Row[] = items.map((it) => {
        const row = { id: it.id ?? newId(table.slice(0, 3)), ...it };
        rows.push(row);
        return row;
      });
      return { data: inserted, error: null, count: inserted.length };
    }
    if (mode === 'update') {
      const matching = rows.filter((r) => matchRow(r, filters));
      matching.forEach((r) => Object.assign(r, payload));
      return { data: matching, error: null, count: matching.length };
    }
    if (mode === 'delete') {
      const keep: Row[] = [];
      let removed = 0;
      for (const r of rows) {
        if (matchRow(r, filters)) removed++;
        else keep.push(r);
      }
      db[table] = keep;
      return { data: null, error: null, count: removed };
    }
    // select
    const matching = rows.filter((r) => matchRow(r, filters));
    return {
      data: head ? null : matching,
      error: null,
      count: countMode ? matching.length : null,
    };
  };

  const builder: any = {
    select: (cols = '*', opts?: { count?: 'exact'; head?: boolean }) => {
      selectCols = cols;
      if (opts?.count) countMode = opts.count;
      if (opts?.head) head = true;
      return builder;
    },
    insert: (p: any) => {
      mode = 'insert';
      payload = p;
      return builder;
    },
    update: (p: any) => {
      mode = 'update';
      payload = p;
      return builder;
    },
    upsert: (p: any) => {
      // Treat upsert as insert-if-no-conflict for the tables we use it on.
      mode = 'insert';
      const items = Array.isArray(p) ? p : [p];
      const filtered = items.filter((it) => {
        if (table === 'packing_project_bookings') {
          return !db.packing_project_bookings.some(
            (r) => r.packing_id === it.packing_id && r.booking_id === it.booking_id
          );
        }
        return true;
      });
      payload = filtered;
      return builder;
    },
    delete: () => {
      mode = 'delete';
      return builder;
    },
    eq: (col: string, val: any) => {
      filters.push({ col, op: 'eq', val });
      return builder;
    },
    in: (col: string, val: any[]) => {
      filters.push({ col, op: 'in', val });
      return builder;
    },
    is: (col: string, val: any) => {
      filters.push({ col, op: 'is', val });
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => {
      const r = exec();
      return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error });
    },
    single: () => {
      const r = exec();
      return Promise.resolve({
        data: r.data?.[0] ?? null,
        error: r.data?.length ? null : { message: 'not found' },
      });
    },
    then: (resolve: any) => {
      const r = exec();
      // Return shape compatible with `await builder` for select/update/delete with no .single()
      const out: any = { data: r.data, error: r.error };
      if (countMode) out.count = r.count;
      return Promise.resolve(out).then(resolve);
    },
  };
  return builder;
};

// ---------------------------------------------------------------------------
// Mock @/integrations/supabase/client
// ---------------------------------------------------------------------------
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'user-test' } }, error: null }),
    },
    from: (table: keyof FakeDB) => makeBuilder(table),
    functions: { invoke: vi.fn() }, // not used directly here (sync mocked)
  },
}));

// ---------------------------------------------------------------------------
// Mock the sync edge function — simulates what sync-booking-to-packing does:
// pulls booking_products and inserts packing_list_items into the target packing.
// ---------------------------------------------------------------------------
const syncCalls: Array<{
  bookingId: string;
  organizationId: string;
  opts: any;
  failed: boolean;
}> = [];
let forceSyncFailure = false;

vi.mock('@/services/booking/bookingPackingSyncService', () => ({
  syncBookingToPacking: vi.fn(
    async (bookingId: string, organizationId: string, opts: any = {}) => {
      const call = { bookingId, organizationId, opts, failed: false };
      syncCalls.push(call);

      if (forceSyncFailure) {
        call.failed = true;
        if (opts.throwOnError) {
          throw new Error('Simulated sync failure');
        }
        return;
      }

      // Resolve packing_id: explicit target wins, otherwise look up existing
      // packing for this booking (mirrors edge-function priority).
      let packingId: string | null = opts.targetPackingId ?? null;
      if (!packingId) {
        const linked = db.packing_project_bookings.find(
          (l) => l.booking_id === bookingId
        );
        packingId =
          linked?.packing_id ??
          db.packing_projects.find(
            (p) => p.booking_id === bookingId && !p.large_project_id
          )?.id ??
          null;
      }
      if (!packingId) return;

      const products = db.booking_products.filter(
        (p) => p.booking_id === bookingId && p.organization_id === organizationId
      );
      for (const p of products) {
        // Idempotent — don't re-insert if already there for this product.
        const exists = db.packing_list_items.some(
          (it) => it.packing_id === packingId && it.booking_product_id === p.id
        );
        if (exists) continue;
        db.packing_list_items.push({
          id: newId('pli'),
          packing_id: packingId,
          booking_product_id: p.id,
          quantity_to_pack: p.quantity ?? 1,
          quantity_packed: 0,
          organization_id: organizationId,
        });
      }
    }
  ),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------
import { createWarehouseProjectFromInbox } from '@/services/warehouseProjectService';
import type { WarehouseProjectInboxItem } from '@/types/warehouseProject';

const ORG = 'org-1';

const seedSingleBooking = (productCount = 2) => {
  const projectId = 'proj-1';
  const bookingId = 'book-1';
  db.projects.push({ id: projectId, booking_id: bookingId, organization_id: ORG });
  db.bookings.push({
    id: bookingId,
    client: 'Acme',
    eventdate: '2026-05-01',
    rigdaydate: '2026-04-28',
    rigdowndate: '2026-05-02',
    deliveryaddress: 'Storgatan 1',
    internalnotes: null,
    organization_id: ORG,
    status: 'CONFIRMED',
  });
  for (let i = 0; i < productCount; i++) {
    db.booking_products.push({
      id: `bp-${bookingId}-${i}`,
      booking_id: bookingId,
      organization_id: ORG,
      name: `Item ${i}`,
      quantity: i + 1,
    });
  }
  return { projectId, bookingId };
};

const seedLargeProject = (bookingCount = 3, productsPerBooking = 4) => {
  const lpId = 'lp-1';
  db.large_projects.push({ id: lpId, name: 'Stora Eventet', organization_id: ORG });
  const bookingIds: string[] = [];
  for (let i = 0; i < bookingCount; i++) {
    const bId = `lpb-${i}`;
    bookingIds.push(bId);
    db.large_project_bookings.push({
      large_project_id: lpId,
      booking_id: bId,
      organization_id: ORG,
    });
    db.bookings.push({
      id: bId,
      client: `Sub ${i}`,
      eventdate: '2026-06-10',
      rigdaydate: '2026-06-08',
      rigdowndate: '2026-06-11',
      deliveryaddress: `Plats ${i}`,
      internalnotes: null,
      organization_id: ORG,
      status: 'CONFIRMED',
    });
    for (let j = 0; j < productsPerBooking; j++) {
      db.booking_products.push({
        id: `bp-${bId}-${j}`,
        booking_id: bId,
        organization_id: ORG,
        name: `Sub${i}-Item${j}`,
        quantity: 1,
      });
    }
  }
  return { lpId, bookingIds };
};

const inboxItem = (over: Partial<WarehouseProjectInboxItem>): WarehouseProjectInboxItem => ({
  id: 'inbox-1',
  source_type: 'project',
  source_id: 'proj-1',
  source_project_number: 'P-1',
  client_name: 'Acme',
  event_date: '2026-05-01',
  status: 'new',
  organization_id: ORG,
  created_at: new Date().toISOString(),
  processed_at: null,
  warehouse_project_id: null,
  ...over,
} as any);

const optsForCreate = () => ({
  name: 'Test wp',
  packStart: '2026-04-25',
  packEnd: '2026-04-27',
  returnStart: '2026-05-03',
  returnEnd: '2026-05-04',
});

beforeEach(() => {
  resetDb();
  syncCalls.length = 0;
  forceSyncFailure = false;
  // Seed inbox row that all tests reference.
  db.warehouse_project_inbox.push(inboxItem({}) as any);
});

// ===========================================================================
// 1. Booking in → packlista skapas korrekt
// ===========================================================================
describe('inbox→packing: single booking', () => {
  it('creates exactly one warehouse project, one packing, and syncs all items', async () => {
    seedSingleBooking(3);
    const item = db.warehouse_project_inbox[0] as WarehouseProjectInboxItem;

    const wp = await createWarehouseProjectFromInbox(item, optsForCreate());

    expect(wp).toBeTruthy();
    expect(db.warehouse_projects).toHaveLength(1);
    expect(db.packing_projects).toHaveLength(1);
    expect(db.packing_projects[0].booking_id).toBe('book-1');
    expect(db.packing_list_items).toHaveLength(3);
    // Inbox flipped to converted ONLY after success.
    expect(db.warehouse_project_inbox[0].status).toBe('converted');
    expect(db.warehouse_project_inbox[0].warehouse_project_id).toBe(wp.id);
  });
});

// ===========================================================================
// 2. Same booking dubbeklickas → ingen dubbel packlista
// ===========================================================================
describe('inbox→packing: idempotency on duplicate trigger', () => {
  it('re-links existing packing instead of creating a second one', async () => {
    seedSingleBooking(2);
    const item = db.warehouse_project_inbox[0] as WarehouseProjectInboxItem;

    await createWarehouseProjectFromInbox(item, optsForCreate());
    expect(db.packing_projects).toHaveLength(1);
    const firstPackingId = db.packing_projects[0].id;
    const firstWpId = db.warehouse_projects[0].id;

    // Simulate "double click": user re-converts (e.g. from a stale UI).
    // Reset inbox to 'new' for the second attempt.
    db.warehouse_project_inbox[0].status = 'new';
    db.warehouse_project_inbox[0].warehouse_project_id = null;

    await createWarehouseProjectFromInbox(item, optsForCreate());

    // Still exactly ONE packing — the second wp re-linked instead of duplicating.
    expect(db.packing_projects).toHaveLength(1);
    expect(db.packing_projects[0].id).toBe(firstPackingId);
    // Now points to the most recent warehouse project.
    expect(db.packing_projects[0].warehouse_project_id).not.toBe(firstWpId);
    // No duplicate items either.
    expect(db.packing_list_items).toHaveLength(2);
  });
});

// ===========================================================================
// 3. Sync failar → tydlig failed state + rollback
// ===========================================================================
describe('inbox→packing: sync failure rollback', () => {
  it('throws and rolls back warehouse_project so inbox stays "new"', async () => {
    seedSingleBooking(2);
    const item = db.warehouse_project_inbox[0] as WarehouseProjectInboxItem;
    forceSyncFailure = true;

    await expect(
      createWarehouseProjectFromInbox(item, optsForCreate())
    ).rejects.toThrow(/sync failure/i);

    // Rolled back — no warehouse_project, no packing, no items.
    expect(db.warehouse_projects).toHaveLength(0);
    expect(db.warehouse_project_tasks).toHaveLength(0);
    expect(db.packing_list_items).toHaveLength(0);
    // Inbox NOT marked converted.
    expect(db.warehouse_project_inbox[0].status).toBe('new');
    expect(db.warehouse_project_inbox[0].warehouse_project_id).toBeNull();
  });
});

// ===========================================================================
// 4. Large project med flera bookings → EN packlista
// 5. Artiklar från alla bookings finns med
// ===========================================================================
describe('inbox→packing: large project consolidation', () => {
  it.each([1, 3, 10])('creates exactly ONE consolidated packing for %i bookings', async (n) => {
    const { lpId, bookingIds } = seedLargeProject(n, 4);
    db.warehouse_project_inbox[0] = inboxItem({
      id: 'inbox-lp',
      source_type: 'large_project',
      source_id: lpId,
      client_name: 'Stora Eventet',
    }) as any;
    const item = db.warehouse_project_inbox[0] as WarehouseProjectInboxItem;

    const wp = await createWarehouseProjectFromInbox(item, optsForCreate());

    expect(wp).toBeTruthy();
    // EXACTLY one consolidated packing — never N.
    expect(db.packing_projects).toHaveLength(1);
    const packing = db.packing_projects[0];
    expect(packing.large_project_id).toBe(lpId);
    expect(packing.warehouse_project_id).toBe(wp.id);

    // Every booking is linked via packing_project_bookings.
    expect(db.packing_project_bookings).toHaveLength(n);
    expect(
      db.packing_project_bookings.every((l) => l.packing_id === packing.id)
    ).toBe(true);

    // Items from ALL bookings are in the same packing.
    expect(db.packing_list_items).toHaveLength(n * 4);
    expect(db.packing_list_items.every((it) => it.packing_id === packing.id)).toBe(true);

    // Every sync call used explicit target_packing_id pointing to the same row.
    const lpSyncs = syncCalls.filter((c) => bookingIds.includes(c.bookingId));
    expect(lpSyncs).toHaveLength(n);
    expect(lpSyncs.every((c) => c.opts.targetPackingId === packing.id)).toBe(true);
    // And every sync was awaited blocking (throwOnError true).
    expect(lpSyncs.every((c) => c.opts.throwOnError === true)).toBe(true);
  });
});

// ===========================================================================
// 6. Legacy/parallell väg kan inte skapa konflikt
// ===========================================================================
describe('inbox→packing: no parallel/legacy creation', () => {
  it('does not create a second packing if one already exists for the booking', async () => {
    const { bookingId } = seedSingleBooking(2);
    // Pre-existing legacy packing (e.g. from old IncomingPackingList flow).
    db.packing_projects.push({
      id: 'legacy-packing',
      booking_id: bookingId,
      organization_id: ORG,
      name: 'Legacy',
      status: 'planning',
    });

    const item = db.warehouse_project_inbox[0] as WarehouseProjectInboxItem;
    await createWarehouseProjectFromInbox(item, optsForCreate());

    // Re-linked the legacy packing instead of creating a duplicate.
    expect(db.packing_projects).toHaveLength(1);
    expect(db.packing_projects[0].id).toBe('legacy-packing');
    expect(db.packing_projects[0].warehouse_project_id).toBe(
      db.warehouse_projects[0].id
    );
  });
});

// ===========================================================================
// 7. UI-status: success returneras endast efter full pipeline
// ===========================================================================
describe('inbox→packing: success only after full pipeline', () => {
  it('inbox stays "new" until sync completes; only flips to "converted" on success', async () => {
    seedSingleBooking(2);
    const item = db.warehouse_project_inbox[0] as WarehouseProjectInboxItem;

    // Snapshot inbox status DURING sync to prove it isn't flipped early.
    let statusDuringSync: string | null = null;
    const { syncBookingToPacking } = await import(
      '@/services/booking/bookingPackingSyncService'
    );
    (syncBookingToPacking as any).mockImplementationOnce(
      async (bId: string, oId: string, opts: any) => {
        statusDuringSync = db.warehouse_project_inbox[0].status;
        // Then run the default fake-sync behaviour.
        const products = db.booking_products.filter((p) => p.booking_id === bId);
        const packingId =
          opts?.targetPackingId ??
          db.packing_projects.find((p) => p.booking_id === bId)?.id ??
          null;
        if (packingId) {
          for (const p of products) {
            db.packing_list_items.push({
              id: newId('pli'),
              packing_id: packingId,
              booking_product_id: p.id,
              quantity_to_pack: p.quantity,
              quantity_packed: 0,
              organization_id: oId,
            });
          }
        }
      }
    );

    const wp = await createWarehouseProjectFromInbox(item, optsForCreate());

    expect(statusDuringSync).toBe('new'); // not yet converted while sync ran
    expect(db.warehouse_project_inbox[0].status).toBe('converted'); // flipped after success
    expect(wp.id).toBeTruthy();
    expect(db.packing_list_items.length).toBeGreaterThan(0);
  });
});
