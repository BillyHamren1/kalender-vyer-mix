import { describe, it, expect, vi } from 'vitest';
import { attachmentBaseUrl, bookingMapUrl, syncBookingFiles } from '../../supabase/functions/_shared/bookingFileSync';

function fixture(options: { existing?: any[]; ownerOrg?: string; readError?: boolean; insertError?: boolean; mapError?: boolean } = {}) {
  const files = [...(options.existing ?? [])];
  const writes: any[] = [], filters: any[] = [], maps: any[] = [];
  const owner = { id: 'booking', map_drawing_url: 'https://files/old.jpg' };
  const client = { from(table: string) {
    let operation = 'read', row: any, opts: any;
    const scope: Record<string, string> = {};
    const resolve = () => {
      filters.push({ table, ...scope });
      if (table === 'bookings') {
        if (scope.organization_id !== (options.ownerOrg ?? 'org')) return { data: null, error: null };
        if (operation === 'update') {
          maps.push(row);
          if (options.mapError) return { error: { message: 'map unavailable' } };
          Object.assign(owner, row); return { error: null };
        }
        return { data: owner, error: null };
      }
      if (operation === 'read') return { data: files, error: options.readError ? { message: 'read unavailable' } : null };
      writes.push({ row, opts });
      if (options.insertError) return { error: { message: 'write unavailable' } };
      const duplicate = files.some((f) => f.file_name === row.file_name || attachmentBaseUrl(f.url) === attachmentBaseUrl(row.url));
      if (duplicate) return { data: [], error: null };
      files.push(row); return { data: [{ id: String(files.length) }], error: null };
    };
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: string) => { scope[key] = value; return builder; },
      maybeSingle: async () => resolve(),
      upsert: (value: any, config: any) => { operation = 'insert'; row = value; opts = config; return builder; },
      update: (value: any) => { operation = 'update'; row = value; return builder; },
      then: (fn: any) => Promise.resolve(resolve()).then(fn),
    };
    return builder;
  } };
  const results = { attachments_imported: 0, errors: [] as any[] };
  const upload = vi.fn(async () => 'https://files/upload.jpg');
  const sync = (booking: any) => syncBookingFiles(client, 'booking', booking, results, 'org', upload);
  return { sync, results, files, writes, filters, maps, upload, owner };
}

describe('one Booking file sync for webhook and export', () => {
  it('merges attachments and files_metadata without filename or signed-URL duplicates on replay', async () => {
    const f = fixture();
    const payload = {
      attachments: [{ file_name: 'plan.pdf', public_url: 'https://files/plan.pdf?token=one', mime_type: 'application/pdf' }],
      files_metadata: [
        { name: 'plan.pdf', url: 'https://files/other.pdf' },
        { name: 'copy.pdf', url: 'https://files/plan.pdf?token=two' },
        { name: 'image.png', url: 'https://files/image.png' },
      ],
    };
    await f.sync(payload); await f.sync(payload);
    expect(f.files).toHaveLength(2);
    expect(f.results).toEqual({ attachments_imported: 2, errors: [] });
    expect(f.files.map((row) => row.file_type)).toEqual(['application/pdf', 'image/png']);
    expect(f.writes.every(({ opts }) => opts.ignoreDuplicates === true && !opts.onConflict)).toBe(true);
    expect(f.filters.every((scope) => scope.organization_id === 'org')).toBe(true);
  });
  it('null attachment URLs do not mask files_metadata with the same filename', async () => {
    const f = fixture();
    await f.sync({ attachments: [{ file_name: 'photo.jpg', id: '', public_url: null }],
      files_metadata: [{ file_name: 'photo.jpg', url: 'https://files/photo.jpg' }] });
    expect(f.files).toHaveLength(1); expect(f.results.errors).toEqual([]);
  });
  it('push base64 and pull URLs of the same file persist once', async () => {
    const f = fixture();
    await f.sync({ attachments: [{ file_name: 'photo.jpg', content_base64: 'aW1hZ2U=' }] });
    await f.sync({ files_metadata: [{ name: 'photo.jpg', url: 'https://files/upload.jpg?signature=new' }] });
    expect(f.upload).toHaveBeenCalledTimes(1); expect(f.files).toHaveLength(1);
    expect(f.results.attachments_imported).toBe(1);
  });
  it('deduplicates against manually uploaded existing files without changing them', async () => {
    const existing = { file_name: 'user.pdf', url: 'https://files/user.pdf?old=1', source: 'user' };
    const f = fixture({ existing: [existing] });
    await f.sync({ attachments: [{ file_name: 'user.pdf', url: 'https://files/new.pdf' },
      { file_name: 'renamed.pdf', url: 'https://files/user.pdf?new=1' }] });
    expect(f.files).toEqual([existing]); expect(f.writes).toHaveLength(0);
  });
  it.each(['map_drawing_url', 'map_snapshot_url'])('projects %s to the same canonical map field on every sync', async (key) => {
    const f = fixture();
    await f.sync({ [key]: 'https://files/map.jpg' }); await f.sync({ [key]: 'https://files/map.jpg' });
    expect(f.maps).toEqual([{ map_drawing_url: 'https://files/map.jpg' }]);
    expect(f.owner.map_drawing_url).toBe('https://files/map.jpg');
  });
  it('supports nested map base64 and preserves drawings when fields are omitted', async () => {
    const f = fixture();
    await f.sync({}); expect(f.maps).toHaveLength(0);
    await f.sync({ map_drawing: { content_base64: 'aW1hZ2U=' } });
    expect(f.maps).toEqual([{ map_drawing_url: 'https://files/upload.jpg' }]);
  });
  it('uses nonempty URL aliases and prefers canonical map URL over snapshot', () => {
    expect(bookingMapUrl({ map_drawing: { public_url: '' }, map_drawing_url: 'https://files/drawing', map_snapshot_url: 'https://files/snapshot' })).toBe('https://files/drawing');
    expect(bookingMapUrl({ map_drawing_url: '', map_snapshot_url: 'https://files/snapshot' })).toBe('https://files/snapshot');
  });
  it('legacy tent images share the same dedup as new file metadata', async () => {
    const f = fixture();
    await f.sync({ files_metadata: [{ name: 'image.jpg', url: 'https://files/tent.jpg' }],
      tent_images: [{ tent_index: 1, view_key: 'front', public_url: 'https://files/tent.jpg?new=1' }] });
    expect(f.files).toHaveLength(1);
  });
  it('fails closed before any write or upload for a wrong organization', async () => {
    const f = fixture({ ownerOrg: 'another-org' });
    await f.sync({ attachments: [{ file_name: 'secret.pdf', content_base64: 'aW1hZ2U=' }], map_snapshot_url: 'https://files/map.jpg' });
    expect(f.writes).toEqual([]); expect(f.maps).toEqual([]); expect(f.upload).not.toHaveBeenCalled();
    expect(f.results.errors[0].error).toContain('attachments_owner_read_failed');
  });
  it('fails closed on existing-file read errors rather than assuming no files', async () => {
    const f = fixture({ readError: true });
    await f.sync({ attachments: [{ file_name: 'photo.jpg', url: 'https://files/photo.jpg' }] });
    expect(f.writes).toEqual([]); expect(f.results.errors[0].error).toContain('attachments_existing_read_failed');
  });
  it.each(['insertError', 'mapError'])('propagates %s to partial-sync errors', async (key) => {
    const f = fixture({ [key]: true });
    await f.sync({ attachments: [{ file_name: 'photo.jpg', url: 'https://files/photo.jpg' }], map_snapshot_url: 'https://files/map.jpg' });
    expect(f.results.errors).toHaveLength(1);
    expect(f.results.errors[0].error).toContain(key === 'insertError' ? 'attachment_insert_failed' : 'map_drawing_update_failed');
  });
  it('failed upload remains an error and is not counted as imported', async () => {
    const f = fixture(); f.upload.mockResolvedValueOnce(null as any);
    await f.sync({ attachments: [{ name: 'photo.jpg', content_base64: 'aW1hZ2U=' }] });
    expect(f.results.attachments_imported).toBe(0); expect(f.results.errors[0].error).toContain('attachment_upload_failed');
  });
});