import { describe, expect, it } from 'vitest'
import { readScannerPackingPage, scannerJobsReadOptions } from '../../supabase/functions/_shared/scannerJobsPage'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function database(rows: any[]) {
  return { from: () => {
    let result = [...rows]; let limit = Infinity
    const q: any = {
      select: () => q, eq: (k: string, v: string) => { result = result.filter(r => r[k] === v); return q },
      in: (k: string, values: string[]) => { result = result.filter(r => values.includes(r[k])); return q },
      order: (k: string) => { result.sort((a, b) => a[k].localeCompare(b[k])); return q },
      gt: (k: string, v: string) => { result = result.filter(r => r[k] > v); return q },
      limit: (n: number) => { limit = n; return q },
      then: (resolve: any) => resolve({ data: result.slice(0, limit), error: null }),
    }; return q
  } }
}
describe('Scanner linked Planning paging', () => {
  it('returns all 625 linked jobs without cross-tenant leakage', async () => {
    const rows = Array.from({length: 625}, (_, i) => ({id:id(i), organization_id:'a', status:'planning'}))
    const db = database([...rows, {id:id(900), organization_id:'b', status:'planning'}])
    const found: any[] = []; let afterId = null
    do { const page = await readScannerPackingPage(db, 'a', { afterId, bookingId:null }); found.push(...page.packings); afterId = page.nextCursor } while(afterId)
    expect(found.map(r => r.id)).toEqual(rows.map(r => r.id))
  })
  it('finds old direct booking and retains duplicates for rejection', async () => {
    const db = database([{id:id(1), organization_id:'a',booking_id:id(900),status:'archived'}, {id:id(2), organization_id:'a',booking_id:id(900),status:'back'}, {id:id(3), organization_id:'b',booking_id:id(900)}])
    const page = await readScannerPackingPage(db,'a',{afterId:null,bookingId:id(900)})
    expect(page.packings).toHaveLength(2); expect(page.nextCursor).toBeNull()
    expect((await readScannerPackingPage(db,'a',{afterId:null,bookingId:id(800)})).packings).toEqual([])
  })
  it.each([{afterId:'bad'}, {bookingId:'bad'}, {afterId:id(1),bookingId:id(2)}])('rejects malformed or mixed selectors', paginationV1 => {
    expect(() => scannerJobsReadOptions({includeScannerContractV1:true,paginationV1})).toThrow()
  })
  it('keeps legacy opt-out', () => expect(scannerJobsReadOptions({})).toBeNull())
})
