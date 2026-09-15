import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const edge = read('supabase/functions/scanner-parcel-api/index.ts')
const migration = read('supabase/migrations/20260914170000_scanner_parcel_command_v1.sql')

describe('scanner parcel gateway', () => {
  it('requires a signed Scanner session and a fresh Bundle/WMS projection', () => {
    expect(edge).toContain('verifyScannerSignedToken')
    expect(edge).toContain('activeScannerSessionMatches')
    expect(edge).toContain('fetchScannerBundleProjection')
    expect(edge).toContain("bundle.reservationId !== identity.reservationId")
    expect(edge).toContain('bundle.blockers.length > 0')
  })

  it('maps local packing rows to one exact WMS physical line before parcel allocation', () => {
    expect(edge).toContain(".select('id, packing_id, organization_id, wms_line_id, wms_item_type_id, excluded')")
    expect(edge).toContain("wmsLineId.split('::')[0]")
    expect(edge).toContain('matches.length === 1')
    expect(edge).toContain('quantity_picked: line.quantityPicked')
  })

  it('returns the same verified item binding map needed by the Scanner parcel UI', () => {
    expect(edge).toContain('loadParcelItemBindings')
    expect(edge).toContain('parentReservationLineId: line.parentReservationLineId')
    expect(edge).toContain('quantityPicked: line.quantityPicked')
    expect(edge).toContain('decorateProjection')
  })

  it('never routes parcel mutations through legacy scanner-api actions', () => {
    expect(edge).not.toMatch(/create_parcel|assign_item_to_parcel|delete_qr_parcel/)
    expect(edge).toContain("admin.rpc('scanner_parcel_command_v1'")
  })
})

describe('scanner parcel database command', () => {
  it('is idempotent and keeps client sessions away from the operation ledger', () => {
    expect(migration).toContain('PRIMARY KEY (organization_id, operation_id)')
    expect(migration).toContain('request_fingerprint')
    expect(migration).toContain('operation_id_conflict')
    expect(migration).toContain('ALTER TABLE public.scanner_parcel_operations ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FROM PUBLIC, anon, authenticated')
    expect(migration).toContain('TO service_role')
  })

  it('does not allocate more parcel quantity than Bundle says is physically picked', () => {
    expect(migration).toContain("'wms_picked_quantity_missing'")
    expect(migration).toContain('v_current_allocated + p_quantity > v_bundle_picked')
    expect(migration).toContain("'parcel_allocation_exceeds_wms_picked'")
  })

  it('requires nonempty parcel before seal and a reason before reopen', () => {
    expect(migration).toContain("'empty_parcel'")
    expect(migration).toContain("'reopen_reason_required'")
    expect(migration).toContain("scanner_state='SEALED'")
    expect(migration).toContain("scanner_state='OPEN'")
  })

  it('uses Planning booking identity as text and Bundle reservation identity as uuid', () => {
    expect(migration).toMatch(/p_booking_id text[\s\S]*p_reservation_id uuid/)
    expect(migration).toContain('v_packing.booking_id IS DISTINCT FROM p_booking_id')
  })
})
