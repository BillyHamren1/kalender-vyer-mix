import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = 'supabase/migrations';
const migration = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8'))
  .filter((sql) => sql.includes('ensure_warehouse_booking_need'))
  .join('\n');

const allMigrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8'))
  .join('\n');

const service = readFileSync('src/services/warehouseProjectService.ts', 'utf8');
const dialog = readFileSync('src/components/warehouse/ConvertInboxDialog.tsx', 'utf8');
const types = readFileSync('src/types/warehouseProject.ts', 'utf8');

describe('canonical Booking -> warehouse need contract', () => {
  it('creates a warehouse need only for CONFIRMED bookings with real inventory references', () => {
    expect(migration).toContain("b.status IS DISTINCT FROM 'CONFIRMED'");
    expect(migration).toContain('bp.inventory_item_type_id IS NOT NULL');
    expect(migration).toContain('bp.inventory_package_id IS NOT NULL');
    expect(migration).toContain('bp.source_missing_since IS NULL');
  });

  it('supports booking as an inbox source without removing legacy sources', () => {
    expect(migration).toContain("source_type IN ('booking','project','large_project')");
    expect(types).toContain("'booking' | 'project' | 'large_project'");
  });

  it('does not duplicate a legacy project inbox when the same booking is already represented', () => {
    expect(migration).toContain('JOIN public.projects p');
    // bookings.id är TEXT i denna databas — kopplingen görs mot b.id direkt.
    expect(migration).toContain('p.booking_id = b.id');
    expect(migration).toContain('source_booking_id = p_booking_id');
  });

  it('tracks the canonical booking on warehouse_projects and reuses an existing packing', () => {
    expect(migration).toContain('warehouse_projects_org_source_booking_unique');
    expect(service).toContain('.eq(\'source_booking_id\', sourceBookingId)');
    expect(service).toContain("inboxItem.source_type === 'booking' || inboxItem.source_type === 'project'");
    expect(service).toContain(".from('packing_projects')");
  });

  it('keeps manager-selected warehouse dates authoritative over system suggestions', () => {
    expect(dialog).toContain('Datumen nedan är systemets förslag.');
    expect(dialog).toContain('Lagerchefens val här blir den operativa planen.');
    expect(service).toContain('start_date: options.packStart');
    expect(service).toContain('end_date: options.packEnd');
  });

  it('materializes the manager-approved Booking plan into the warehouse calendar', () => {
    expect(migration).toContain('warehouse_project_task_id');
    expect(service).toContain('materializeBookingWarehousePlan');
    expect(service).toContain("inboxItem.source_type !== 'booking'");
    expect(service).toContain('manually_adjusted: true');
    expect(service).toContain('warehouse_project_task_id: task.id');
  });

  it('protects the approved manager plan from Booking suggestion collisions', () => {
    expect(allMigrations).toContain('guard_authoritative_warehouse_plan');
    expect(allMigrations).toContain("NEW.warehouse_project_task_id IS NOT NULL");
    expect(allMigrations).toContain("NEW.event_type IN ('packing', 'return')");
    expect(allMigrations).toContain('RETURN NULL;');
    expect(allMigrations).toContain('NEW.booking_id := NULL;');
    expect(allMigrations).toContain('NEW.start_time := OLD.start_time;');
    expect(allMigrations).toContain('NEW.resource_id := OLD.resource_id;');
    expect(allMigrations).toContain('NEW.manually_adjusted := true;');
  });

  it('keeps multi-day worker assignments linked to the canonical booking', () => {
    expect(allMigrations).toContain('source_booking_id text');
    expect(allMigrations).toContain('restore_warehouse_assignment_booking');
    expect(allMigrations).toContain('COALESCE(wce.source_booking_id, wce.booking_id)');
    expect(allMigrations).toContain('NEW.booking_id := _booking_id;');
  });

  it('does not change the stable Booking warehouse upsert key', () => {
    expect(allMigrations).toContain('warehouse_calendar_events_org_booking_event_type_unique');
    expect(allMigrations).not.toContain('DROP INDEX IF EXISTS warehouse_calendar_events_org_booking_event_type_unique');
  });

  it('separates planned warehouse work from packing workflow checkpoints', () => {
    expect(migration).toContain("task_kind text NOT NULL DEFAULT 'planned_work'");
    expect(service).toContain("task_kind: 'planned_work'");
    expect(types).toContain("task_kind?: 'planned_work'");
  });

  it('contains no destructive backfill of historical inbox rows', () => {
    expect(migration).not.toContain('DELETE FROM public.warehouse_project_inbox');
    expect(migration).not.toContain('TRUNCATE');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_booking_id');
  });
});
