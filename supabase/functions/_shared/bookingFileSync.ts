/** One additive file projection for webhook and export payloads. Never deletes files. */
type FileRow = Record<string, unknown>;
type SyncResults = { attachments_imported: number; errors: Array<{ booking_id: string; error: string }> };
type Upload = (client: any, base64: string, path: string, mime: string) => Promise<string | null>;
const text = (...values: unknown[]): string | null => {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
};
const rows = (value: unknown): FileRow[] => Array.isArray(value)
  ? value.filter((row): row is FileRow => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
export const attachmentBaseUrl = (url: string): string => url.split('?')[0];
export const bookingMapUrl = (booking: FileRow): string | null => {
  const map = rows([booking.map_drawing])[0] ?? {};
  return text(map.public_url, map.url, booking.map_drawing_url, booking.map_snapshot_url);
};
const mimeFor = (name: string, supplied?: unknown): string => text(supplied) ?? ({
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif',
} as Record<string, string>)[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

export async function syncBookingFiles(
  client: any, bookingId: string, booking: FileRow, results: SyncResults, orgId: string, upload: Upload,
): Promise<void> {
  if (!bookingId || !orgId) throw new Error('booking_file_scope_required');
  const fail = (code: string, error?: unknown) => results.errors.push({
    booking_id: bookingId, error: `${code}:${error instanceof Error ? error.message : String(error ?? '')}`,
  });
  const { data: owned, error: ownerError } = await client.from('bookings').select('id,map_drawing_url')
    .eq('id', bookingId).eq('organization_id', orgId).maybeSingle();
  if (ownerError || !owned) { fail('attachments_owner_read_failed', ownerError?.message ?? 'not_found'); return; }
  const { data: existing, error: existingAttachmentsError } = await client.from('booking_attachments')
    .select('url,file_name').eq('booking_id', bookingId).eq('organization_id', orgId);
  if (existingAttachmentsError) { fail('attachments_existing_read_failed', existingAttachmentsError.message); return; }
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();
  for (const file of rows(existing)) {
    const url = text(file.url), name = text(file.file_name);
    if (url) seenUrls.add(attachmentBaseUrl(url));
    if (name) seenNames.add(name);
  }
  const candidates = [...rows(booking.attachments), ...rows(booking.files_metadata),
    ...rows(booking.tent_images).map((image) => ({ ...image,
      file_name: text(image.file_name, image.name) ?? `Tält ${image.tent_index ?? ''} - ${image.view_key ?? ''}`.trim(),
    }))];
  for (const file of candidates) {
    try {
      let url = text(file.public_url, file.url, file.file_url);
      const name = text(file.file_name, file.name) ?? (url ? attachmentBaseUrl(url).split('/').pop() : null);
      // No usable URL/content/name is not a file; metadata may supply it later.
      if (!name || seenNames.has(name) || (url && seenUrls.has(attachmentBaseUrl(url)))) continue;
      const mime = mimeFor(name, text(file.mime_type, file.file_type, file.type));
      const base64 = text(file.content_base64);
      if (!url && base64) {
        url = await upload(client, base64, `${bookingId}/attachments/${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, mime);
        if (!url) { fail('attachment_upload_failed'); continue; }
      }
      if (!url || seenUrls.has(attachmentBaseUrl(url))) continue;
      // Both unique indexes enforce races; either 23505 means another writer saved it.
      const { data: inserted, error } = await client.from('booking_attachments').insert({
        booking_id: bookingId, organization_id: orgId, url, file_name: name, file_type: mime, source: 'import',
      }).select('id');
      if (error?.code === '23505') { seenUrls.add(attachmentBaseUrl(url)); seenNames.add(name); continue; }
      if (error) { fail('attachment_insert_failed', error.message); continue; }
      seenUrls.add(attachmentBaseUrl(url)); seenNames.add(name);
      results.attachments_imported += inserted?.length ?? 0;
    } catch (error) { fail('attachment_processing_failed', error); }
  }
  try {
    let mapUrl = bookingMapUrl(booking);
    const map = rows([booking.map_drawing])[0] ?? {};
    const base64 = text(map.content_base64);
    if (!mapUrl && base64) {
      mapUrl = await upload(client, base64, `${bookingId}/map_drawing.jpg`, 'image/jpeg');
      if (!mapUrl) { fail('map_drawing_upload_failed'); return; }
    }
    // An omitted map field must not clear the previous drawing.
    if (mapUrl && mapUrl !== owned.map_drawing_url) {
      const { error } = await client.from('bookings').update({ map_drawing_url: mapUrl })
        .eq('id', bookingId).eq('organization_id', orgId);
      if (error) fail('map_drawing_update_failed', error.message);
    }
  } catch (error) { fail('map_drawing_update_failed', error); }
}