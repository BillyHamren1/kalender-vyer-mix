import { supabase } from '@/integrations/supabase/client';
import {
  syncBookingToPacking,
  type BookingPackingSyncResult,
} from '@/services/booking/bookingPackingSyncService';

export interface PackingWmsRefreshResult {
  completedAt: string;
  bookingCount: number;
  productCount: number;
  packingRowCount: number;
  changedRowCount: number;
  syncResults: BookingPackingSyncResult[];
}

interface BookingSource {
  id: string;
  organization_id: string;
}

const loadBookingSources = async (bookingIds: string[]): Promise<BookingSource[]> => {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, organization_id')
    .in('id', bookingIds);

  if (error) throw error;

  const sources = (data || []).filter(
    (row): row is BookingSource => Boolean(row.id && row.organization_id),
  );

  if (sources.length !== bookingIds.length) {
    throw new Error('Alla kopplade bokningar kunde inte verifieras i organisationen.');
  }

  const organizationIds = new Set(sources.map((source) => source.organization_id));
  if (organizationIds.size !== 1) {
    throw new Error('Packprojektets bokningar tillhör olika organisationer.');
  }

  return sources;
};

const verifyWmsProjection = async (
  packingId: string,
  sources: BookingSource[],
): Promise<{ productCount: number; packingRowCount: number }> => {
  const bookingIds = sources.map((source) => source.id);
  const organizationId = sources[0].organization_id;

  const [productsResult, packingRowsResult] = await Promise.all([
    supabase
      .from('booking_products')
      .select('id, sync_key')
      .in('booking_id', bookingIds)
      .eq('organization_id', organizationId)
      .is('source_missing_since', null),
    supabase
      .from('packing_list_items')
      .select('id, wms_line_id, source_booking_id')
      .eq('packing_id', packingId)
      .eq('organization_id', organizationId)
      .or('excluded.eq.false,excluded.is.null'),
  ]);

  if (productsResult.error) throw productsResult.error;
  if (packingRowsResult.error) throw packingRowsResult.error;

  const products = productsResult.data || [];
  const packingRows = packingRowsResult.data || [];
  const legacyProducts = products.filter((product) => !product.sync_key?.startsWith('wms:'));
  const nonWmsPackingRows = packingRows.filter(
    (row) => !row.wms_line_id || !row.source_booking_id || !bookingIds.includes(row.source_booking_id),
  );

  if (legacyProducts.length > 0) {
    throw new Error(`${legacyProducts.length} aktiv(a) produktrad(er) saknar WMS-källa.`);
  }
  if (nonWmsPackingRows.length > 0) {
    throw new Error(`${nonWmsPackingRows.length} aktiv(a) packrad(er) kunde inte verifieras mot WMS.`);
  }

  return {
    productCount: products.length,
    packingRowCount: packingRows.length,
  };
};

/**
 * Runs the canonical WMS projection synchronously and proves that the active
 * Planning projection contains WMS identities only. Empty demand is valid.
 */
export const refreshPackingFromWms = async (
  packingId: string,
  bookingIds: string[],
): Promise<PackingWmsRefreshResult> => {
  if (!packingId) throw new Error('Packprojekt saknas.');
  if (bookingIds.length === 0) throw new Error('Ingen bokning är kopplad till packprojektet.');

  const sources = await loadBookingSources(bookingIds);
  const syncResults: BookingPackingSyncResult[] = [];

  for (const source of sources) {
    const result = await syncBookingToPacking(source.id, source.organization_id, {
      throwOnError: true,
      targetPackingId: packingId,
    });
    if (!result) throw new Error(`WMS-synken gav inget kvitto för bokning ${source.id}.`);
    syncResults.push(result);
  }

  const verification = await verifyWmsProjection(packingId, sources);

  return {
    completedAt: new Date().toISOString(),
    bookingCount: sources.length,
    productCount: verification.productCount,
    packingRowCount: verification.packingRowCount,
    changedRowCount: syncResults.reduce((sum, result) => sum + (result.items_synced || 0), 0),
    syncResults,
  };
};
