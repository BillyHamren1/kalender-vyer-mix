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
    expect(receiveBooking).toContain("'booking.confirmed': 100");
    expect(receiveBooking).toContain("'booking.cancelled': 100");
    expect(receiveBooking).toContain("'booking.updated': 60");
    expect(receiveBooking).toContain("'booking.created': 40");
    expect(receiveBooking).toContain("'booking.offer': 20");
    expect(receiveBooking).toContain("'incremental': 0");
    expect(receiveBooking).toContain('priority,');
  });

  it('coalescar bara mot pending jobb — pågående bearbetning schemalägger ny läsning', () => {
    expect(receiveBooking).toContain("(j: any) => j.status === 'pending'");
    expect(receiveBooking).not.toContain("j.status === 'pending' || j.status === 'processing'");
  });
});
