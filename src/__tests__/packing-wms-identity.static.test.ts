import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

describe('packing WMS canonical identity contract', () => {
  it('snapshots WMS identity onto packing rows and freezes while warehouse acknowledgement is required', () => {
    const src = read('supabase/functions/sync-booking-to-packing/index.ts')
    expect(src).toContain('wms_item_type_id: p.inventory_item_type_id || null')
    expect(src).toContain('const needsWarehouseAck = requiresWarehouseAcknowledgement({')
    expect(src).toMatch(/if \(needsWarehouseAck\) \{[\s\S]*?return 0/)
    expect(src.indexOf('if (needsWarehouseAck)')).toBeLessThan(src.indexOf("wms_item_type_id: product.inventory_item_type_id || null"))
    expect(src).toContain('wms_identity_needs_repair')
  })

  it('manual legacy checkoff is warning/local-only, not a hard identity block', () => {
    const src = read('supabase/functions/scanner-api/index.ts')
    expect(src).toContain('legacy local-only checkoff')
    expect(src).toContain('identityRepairRequired: true')
    expect(src).toContain("'type_mismatch'")
  })
})
