// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RawGpsDrawer } from "@/components/staff/RawGpsDrawer";
import type { DayPing } from "@/hooks/admin/useDayPings";
import type { DayTimelineEvent } from "@/hooks/admin/useDayTimeline";

function ping(id: string, isoTime: string): DayPing {
  return {
    id, recorded_at: isoTime,
    lat: 59.3, lng: 18.0, accuracy: 10, speed: null,
    source: null, time_report_id: null,
  };
}

const event: DayTimelineEvent = {
  id: "e1", organization_id: "o", staff_id: "s", date: "2026-04-29",
  event_type: "arrived_at_reported_site",
  ts: "2026-04-29T10:00:00Z",
  lat: 59.3, lng: 18.0, accuracy: 12, source: "fg",
  matched_site_id: null, matched_site_type: null, matched_site_name: null,
  distance_to_reported_site_m: null, confidence: 1,
  human_readable_text: "Anlände", related_time_report_id: null,
  related_workday_id: null, engine_version: "v1",
};

describe("RawGpsDrawer", () => {
  const allPings = [
    ping("p1", "2026-04-29T08:00:00Z"),  // outside ±10min
    ping("p2", "2026-04-29T09:55:00Z"),  // inside
    ping("p3", "2026-04-29T10:05:00Z"),  // inside
    ping("p4", "2026-04-29T12:00:00Z"),  // outside
  ];

  it("opens and closes the drawer", () => {
    const { getByText, queryByText } = render(
      <RawGpsDrawer pings={allPings} date="2026-04-29" selectedEvent={null} />,
    );
    expect(queryByText("Rå GPS-data")).not.toBeInTheDocument();
    fireEvent.click(getByText(/Visa rå GPS-data/i));
    expect(getByText("Rå GPS-data")).toBeInTheDocument();
  });

  it("filters pings within ±10 min around the selected event when toggled", () => {
    const { getByText, getAllByRole } = render(
      <RawGpsDrawer pings={allPings} date="2026-04-29" selectedEvent={event} />,
    );
    fireEvent.click(getByText(/Visa rå GPS-data/i));

    // Initially shows all 4 rows
    let dataRows = getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(4);

    // Toggle filter
    fireEvent.click(getByText(/Filtrera ±10 min runt vald/i));
    dataRows = getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(2);
  });
});
