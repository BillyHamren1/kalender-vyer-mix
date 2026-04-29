// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock mapbox-gl to a jsdom-friendly stub
const mapInstance = {
  addControl: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  remove: vi.fn(),
  flyTo: vi.fn(),
  fitBounds: vi.fn(),
  getLayer: vi.fn(),
  getSource: vi.fn(),
  removeLayer: vi.fn(),
  removeSource: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  isStyleLoaded: vi.fn().mockReturnValue(true),
};
class FakeMarker {
  el = document.createElement("div");
  setLngLat() { return this; }
  setPopup() { return this; }
  addTo() { return this; }
  remove() {}
  getElement() { return this.el; }
}
class FakeBounds {
  empty = true;
  extend() { this.empty = false; return this; }
  isEmpty() { return this.empty; }
}

vi.mock("mapbox-gl", () => ({
  default: {
    Map: vi.fn(() => mapInstance),
    Marker: vi.fn(() => new FakeMarker()),
    Popup: vi.fn(() => ({ setHTML: () => ({}) })),
    NavigationControl: vi.fn(),
    LngLatBounds: vi.fn(() => new FakeBounds()),
    accessToken: "",
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: { token: "tok" }, error: null }) },
  },
}));

import { DayTimelineMap } from "@/components/staff/DayTimelineMap";
import type { DayTimelineEvent } from "@/hooks/admin/useDayTimeline";

function ev(id: string, lat: number, lng: number, type = "arrived_at_reported_site"): DayTimelineEvent {
  return {
    id, organization_id: "o", staff_id: "s", date: "2026-04-29",
    event_type: type, ts: "2026-04-29T08:00:00Z",
    lat, lng, accuracy: 12, source: "fg",
    matched_site_id: null, matched_site_type: null, matched_site_name: null,
    distance_to_reported_site_m: null, confidence: 1,
    human_readable_text: "Anlände", related_time_report_id: null,
    related_workday_id: null, engine_version: "v1",
  };
}

describe("DayTimelineMap", () => {
  it("renders map container with header summary for 3 events", () => {
    const events = [ev("e1", 59.3, 18.0), ev("e2", 59.31, 18.05, "left_reported_site"), ev("e3", 59.32, 18.1, "timer_stopped")];
    const { container, getByText } = render(
      <DayTimelineMap
        events={events}
        pings={[]}
        knownPlaces={[{ id: "k1", name: "Lager", lat: 59.3, lng: 18.0, radius_m: 100 }]}
        selectedEventId={null}
      />,
    );
    expect(getByText("Karta över händelser")).toBeInTheDocument();
    expect(container.querySelector("section")).toMatchSnapshot();
  });
});
