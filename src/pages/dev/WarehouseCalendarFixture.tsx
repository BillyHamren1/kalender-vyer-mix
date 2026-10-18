import React, { useMemo } from 'react';
import WarehouseWorkCalendar, { type WarehouseCalendarView } from '@/components/warehouse/WarehouseWorkCalendar';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

/**
 * DEV-ONLY layout fixture for the real WarehouseWorkCalendar (no auth, no
 * network data). Synthetic overlapping jobs only — never production data.
 * Route: /dev/warehouse-calendar-fixture?view=weekly|day&n=6
 */
const TYPES = ['packing', 'delivery', 'return', 'inventory', 'unpacking', 'internal_task'];
const DATE = '2026-10-19';

export default function WarehouseCalendarFixture() {
  const params = new URLSearchParams(window.location.search);
  const view = (params.get('view') === 'day' ? 'day' : 'weekly') as WarehouseCalendarView;
  const n = Math.max(1, Math.min(20, Number(params.get('n') || 6)));
  const events = useMemo<CalendarEvent[]>(() => Array.from({ length: n }, (_, i) => ({
    id: `fixture-${i}`,
    title: `Testjobb ${i + 1}`,
    start: `${DATE}T08:00:00`,
    end: `${DATE}T11:00:00`,
    resourceId: 'warehouse',
    eventType: TYPES[i % TYPES.length],
    bookingNumber: `T-${100 + i}`,
    extendedProps: {
      bookingTitle: `Syntetisk kund ${i + 1}`,
      timeLabel: '08:00–11:00',
      crewCount: i % 2 ? 1 : 0,
      crewLabel: i % 2 ? 'Testperson' : undefined,
      crewFullLabel: i % 2 ? 'Testperson' : undefined,
    },
  }) as unknown as CalendarEvent), [n]);
  return (
    <div className="flex h-screen flex-col bg-background p-4" data-testid="warehouse-calendar-fixture">
      <WarehouseWorkCalendar
        events={events}
        currentDate={new Date(`${DATE}T12:00:00`)}
        viewMode={view}
        isLoading={false}
        onRefresh={async () => {}}
        onOpenBooking={() => {}}
        onOpenDay={() => {}}
        onOpenEvent={() => {}}
      />
    </div>
  );
}
