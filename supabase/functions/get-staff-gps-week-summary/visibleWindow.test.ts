import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeVisibleWindow } from "../_shared/staff-gps/visibleWindow.ts";
import type { DaySegment } from "../_shared/staff-gps/dayPartition.ts";

const D = "2026-05-18";
const t = (hhmm: string) => `${D}T${hhmm}:00.000Z`;

Deno.test("summarizeVisibleWindow clips segments to first/last visible time", () => {
  const segments: DaySegment[] = [
    { type: "private", label: "Boende – Vällsta", start: t("02:01"), end: t("06:55"), minutes: 294, knownSiteId: "home" },
    { type: "work", label: "FA Warehouse", start: t("06:55"), end: t("17:00"), minutes: 605, knownSiteId: "fa" },
    { type: "travel", label: "Resa", start: t("17:00"), end: t("18:00"), minutes: 60 },
    { type: "work", label: "Craft", start: t("18:00"), end: t("22:29"), minutes: 269, knownSiteId: "craft" },
    { type: "private", label: "Boende – Vällsta", start: t("22:29"), end: t("23:30"), minutes: 61, knownSiteId: "home" },
  ];

  const summary = summarizeVisibleWindow(segments, t("06:55"), t("22:29"));

  assertEquals(summary.windowMin, 934);
  assertEquals(summary.privateMin, 0);
  assertEquals(summary.workMin, 874);
  assertEquals(summary.travelMin, 60);
  assertEquals(summary.segments.map((segment) => segment.label), ["FA Warehouse", "Resa", "Craft"]);
  assertEquals(summary.segments[0].start, t("06:55"));
  assertEquals(summary.segments[summary.segments.length - 1].end, t("22:29"));
  assertEquals(summary.placeNames, ["FA Warehouse", "Craft"]);
});