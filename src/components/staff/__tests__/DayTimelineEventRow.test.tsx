import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DayTimelineEventRow } from "@/components/staff/DayTimelineEventRow";
import type { DayTimelineEvent } from "@/hooks/admin/useDayTimeline";

function makeEvent(overrides: Partial<DayTimelineEvent>): DayTimelineEvent {
  return {
    id: "ev-1",
    organization_id: "org",
    staff_id: "staff",
    date: "2026-04-29",
    event_type: "workday_started",
    ts: "2026-04-29T07:00:00Z",
    lat: null, lng: null, accuracy: null, source: null,
    matched_site_id: null, matched_site_type: null, matched_site_name: null,
    distance_to_reported_site_m: null,
    confidence: 1.0,
    human_readable_text: null,
    related_time_report_id: null, related_workday_id: null,
    engine_version: "v1",
    ...overrides,
  };
}

describe("DayTimelineEventRow", () => {
  it("renders workday_started with default label", () => {
    const { getByText } = render(
      <DayTimelineEventRow event={makeEvent({ event_type: "workday_started", human_readable_text: "Arbetsdag startad kl 07:00" })} />,
    );
    expect(getByText("Arbetsdag startad kl 07:00")).toBeInTheDocument();
  });

  it("renders arrived_at_reported_site with matched site name", () => {
    const { getByText } = render(
      <DayTimelineEventRow event={makeEvent({
        event_type: "arrived_at_reported_site",
        ts: "2026-04-29T08:30:00Z",
        matched_site_name: "David Adrians väg 5",
        human_readable_text: "Anlände till rapporterad plats",
      })} />,
    );
    expect(getByText("Anlände till rapporterad plats")).toBeInTheDocument();
    expect(getByText("David Adrians väg 5")).toBeInTheDocument();
  });

  it("renders gps_gap with low-confidence destructive badge", () => {
    const { getByText } = render(
      <DayTimelineEventRow event={makeEvent({
        event_type: "gps_gap_started",
        ts: "2026-04-29T11:15:00Z",
        confidence: 0.4,
        human_readable_text: "GPS-glapp började",
      })} />,
    );
    expect(getByText("GPS-glapp började")).toBeInTheDocument();
    expect(getByText(/Låg säkerhet 40%/i)).toBeInTheDocument();
  });
});
