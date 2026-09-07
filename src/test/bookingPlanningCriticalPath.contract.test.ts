import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Booking -> Planning critical path', () => {
  it('does not run an incremental producer in every browser tab', () => {
    const source = read('src/hooks/useBackgroundImport.ts');
    expect(source).not.toContain('setInterval(');
    expect(source).not.toContain('performImport');
  });

  it('manual project refresh is incremental, never historical', () => {
    const source = read('src/pages/ProjectManagement.tsx');
    expect(source).toContain("syncMode: 'incremental'");
    expect(source).not.toContain('forceHistoricalImport: true');
    expect(source).not.toContain('historicalMode: true');
  });

  it('project inbox and calendar popup invalidate on booking UPDATE', () => {
    const projectPage = read('src/pages/ProjectManagement.tsx');
    const calendarPopup = read('src/components/calendar/NewBookingsPopup.tsx');
    expect(projectPage).toMatch(/table: 'bookings',[\s\S]{0,120}events: \['INSERT', 'UPDATE'\]/);
    expect(calendarPopup).toMatch(/table: 'bookings',[\s\S]{0,120}events: \['INSERT', 'UPDATE'\]/);
  });

  it('server poller refuses to overlap an unfinished incremental batch', () => {
    const source = read('supabase/functions/incremental-sync-all-orgs/index.ts');
    expect(source).toContain("status: 'skipped_active_batch'");
    expect(source).toContain(".eq('status', 'pending')");
  });

  it('webhook intake uses the atomic enqueue RPC', () => {
    const source = read('supabase/functions/receive-booking/index.ts');
    expect(source).toContain("'enqueue_booking_sync_job'");
    expect(source).toContain('p_priority: priority');
  });

  it('critical intake wakes the worker without weakening the durable cron fallback', () => {
    const source = read('supabase/functions/receive-booking/index.ts');
    expect(source).toContain('job.job_priority === 100');
    expect(source).toContain('EdgeRuntime.waitUntil');
    expect(source).toContain('/functions/v1/process-sync-jobs');
  });

  it('replays an event received while the same booking is already in flight', () => {
    const migration = read(
      'supabase/migrations/20260907113642_replay_booking_events_received_in_flight.sql',
    );
    expect(migration).toContain("WHEN j.status = 'processing' THEN now()");
    expect(migration).toContain(
      "status = CASE WHEN next_attempt_at IS NULL THEN 'completed' ELSE 'retryable' END",
    );
    expect(migration).toContain('AND worker_token = _worker_token');
  });
});
