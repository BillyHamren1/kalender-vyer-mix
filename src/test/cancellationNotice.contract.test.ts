import { describe, expect, it } from 'vitest';
import { recordCancellationNotice } from '../../supabase/functions/_shared/cancellation-notice';
import { applyBookingCancellation } from '../../supabase/functions/_shared/cancellation-handler';
import fs from 'node:fs';

const input = { bookingId: 'booking', organizationId: 'org', sourceUpdatedAt: '2026-10-13T10:00:00.123456Z', sourceVersion: null };

describe('commercial cancellation with outstanding warehouse work', () => {
  it('acknowledges the commercial fact without claiming physical cleanup', async () => {
    const calls: any[] = [];
    const reply = await recordCancellationNotice({ rpc: async (...args: any[]) => {
      calls.push(args); return { data: { success: true, outcome: 'cancelled', mutations: { packing_preserved: 1 } } };
    } }, input);
    expect(calls[0][0]).toBe('record_booking_cancellation_notice_atomic');
    expect(calls[0][1].p_source_updated_at).toBe(input.sourceUpdatedAt);
    expect(reply).toMatchObject({ success: true, outcome: 'applied', results: {
      commercial_status: 'CANCELLED', operational_cleanup_applied: false, action_required: true, packing_preserved: 1,
    } });
  });
  it.each(['stale_revision', 'revision_conflict', 'reservation_lost'])('does not acknowledge %s', async (outcome) => {
    const reply = await recordCancellationNotice({ rpc: async () => ({ data: { success: false, outcome } }) }, input);
    expect(reply.success).toBe(false);
    expect(reply.completed).toBe(false);
  });
  it('duplicate notice is already current', async () => {
    const reply = await recordCancellationNotice({ rpc: async () => ({ data: { success: true, outcome: 'already_cancelled' } }) }, input);
    expect(reply.outcome).toBe('already_current');
  });
  it('manual cleanup receipt does not claim preserved packing was deleted', async () => {
    const reply = await applyBookingCancellation({ rpc: async () => ({ data: {
      success: true, outcome: 'cancelled', mutations: { packing_preserved: 2, audit: 1 },
    } }) }, { id: input.bookingId, organization_id: input.organizationId }, {
      reason: 'test', source_status: 'CANCELLED', source_revision: input.sourceUpdatedAt,
    }, { manualApproval: true });
    expect(reply).toMatchObject({ status: 'cancelled', action_required: true, packing_deleted: false, packing_preserved: 2 });
  });
  it('explicit refresh cannot reset monotonic watermarks; safe repair remains', () => {
    const source = fs.readFileSync('supabase/functions/import-bookings/index.ts', 'utf8');
    expect(source).not.toContain('applied_source_updated_at: null');
    expect(source).not.toContain('highest_seen_source_version: null');
    expect(source).toContain('ensureActivePackingNotEmpty');
  });
});
