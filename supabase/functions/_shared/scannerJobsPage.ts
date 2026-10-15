/** Additive pagination over actual Planning identities. Tenant is server-derived. */
export const SCANNER_JOBS_PAGE_SIZE = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function scannerJobsReadOptions(params: any) {
  if (params?.paginationV1 === undefined) return null
  const page = params.paginationV1
  if (!page || typeof page !== 'object' || Array.isArray(page) ||
      (page.afterId != null && (typeof page.afterId !== 'string' || !UUID.test(page.afterId))) ||
      (page.bookingId != null && (typeof page.bookingId !== 'string' || !UUID.test(page.bookingId))) ||
      (page.afterId && page.bookingId) || params.includeScannerContractV1 !== true) {
    throw { status: 400, message: 'invalid_scanner_pagination' }
  }
  return { afterId: page.afterId ?? null, bookingId: page.bookingId ?? null }
}
export async function readScannerPackingPage(db: any, organizationId: string, options: { afterId: string | null; bookingId: string | null }) {
  let query = db.from('packing_projects').select('*').eq('organization_id', organizationId)
  if (options.bookingId) query = query.eq('booking_id', options.bookingId)
  else query = query.in('status', ['planning', 'in_progress', 'packed', 'delivered', 'returning', 'back'])
  query = query.order('id', { ascending: true })
  if (options.afterId) query = query.gt('id', options.afterId)
  const { data, error } = await query.limit(options.bookingId ? 2 : SCANNER_JOBS_PAGE_SIZE + 1)
  if (error) throw error
  const rows = data || []
  const hasMore = !options.bookingId && rows.length > SCANNER_JOBS_PAGE_SIZE
  const packings = hasMore ? rows.slice(0, SCANNER_JOBS_PAGE_SIZE) : rows
  return { packings, nextCursor: hasMore ? packings[packings.length - 1].id : null }
}
