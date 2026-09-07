import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

describe('Booking → Planning sync contract', () => {
  const projectManagement = read('src/pages/ProjectManagement.tsx');
  const inbox = read('src/components/project/IncomingBookingsList.tsx');
  const popup = read('src/components/calendar/NewBookingsPopup.tsx');
  const backgroundImport = read('src/hooks/useBackgroundImport.ts');
  const receiveBooking = read('supabase/functions/receive-booking/index.ts');
  const priorityPolicy = read('supabase/functions/_shared/bookingSyncPriority.ts');
  const queueMigration = read('supabase/migrations/20260907105835_prioritize_booking_sync_and_recover_queue.sql');

  it('lyssnar på både INSERT och UPDATE för bookings', () => {
    for (const src of [projectManagement, inbox, popup]) {
      expect(src).toContain("events: ['INSERT', 'UPDATE']");
      expect(src).toContain("table: 'bookings'");
    }
  });

  it('filtrerar realtime-kanaler på organization_id', () => {
    for (const src of [projectManagement, inbox, popup]) {
      expect(src).toContain('filter: organizationId ? `organization_id=eq.${organizationId}`');
      expect(src).toContain('pause: () => !organizationId');
    }
  });

  it('invalididerar boknings-, projekt- och kalenderfrågor', () => {
    for (const src of [projectManagement, inbox, popup]) {
      expect(src).toContain("['bookings-without-project', organizationId]");
      expect(src).toContain("['projects']");
      expect(src).toContain("['calendar-events']");
      expect(src).toContain("['planner-calendar']");
    }
  });

  it('använder organisationsspecifika query keys och org-filtrerad query', () => {
    for (const src of [inbox, popup]) {
      expect(src).toContain("queryKey: ['bookings-without-project', organizationId]");
      expect(src).toContain("enabled: !!organizationId");
      expect(src).toContain(".eq('organization_id', organizationId!)");
    }
  });

  it('har ingen automatisk femminutersimport i klienten', () => {
    expect(backgroundImport).not.toContain('setInterval(');
  });

  it('manuell Uppdatera kör inkrementell synk, aldrig historisk helimport', () => {
    expect(projectManagement).toContain("syncMode: 'incremental'");
    expect(projectManagement).not.toContain('forceHistoricalImport: true');
    expect(backgroundImport).toContain("syncMode: 'incremental'");
  });

  it('behåller den prioriterade kön', () => {
    expect(priorityPolicy).toContain('incremental: 0');
    expect(priorityPolicy).toContain('offer: 20');
    expect(priorityPolicy).toContain('created: 40');
    expect(priorityPolicy).toContain('updated: 60');
    expect(priorityPolicy).toContain('critical: 100');
    expect(priorityPolicy).toContain('case "booking.confirmed"');
    expect(priorityPolicy).toContain('case "booking.cancelled"');
    expect(receiveBooking).toContain('bookingSyncPriority(normalizedEventType)');
  });

  it('coalescar atomiskt och markerar pågående jobb för en ny läsning', () => {
    expect(receiveBooking).toContain("'enqueue_booking_sync_job'");
    expect(queueMigration).toContain("j.status IN ('pending', 'processing', 'retryable')");
    expect(queueMigration).toContain("WHEN j.status = 'processing' THEN now()");
    expect(receiveBooking).not.toContain(".insert({\n        booking_id");
  });
});
