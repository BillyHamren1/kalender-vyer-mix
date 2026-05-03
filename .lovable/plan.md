1. Fix timestamp truth for Tidrapporter
- Replace the current browser-dependent `composeLocalIso()` flow in `src/pages/StaffTimeReports.tsx` with a Stockholm-safe conversion helper.
- Treat `time_reports.start_time/end_time` as Europe/Stockholm wall-clock values and convert them to the exact UTC instants that the GPS pings use.
- Use the same helper anywhere Tidrapporter builds ISO timestamps from `report_date + HH:mm[:ss]` so start/end matching is deterministic regardless of browser timezone.

2. Stop resolving places from only FA Warehouse
- Refactor the day-place source so it can match against more than `organization_locations`.
- Include the actual job sites for the current day as known places too:
  - booking delivery coordinates
  - large project coordinates
  - organization locations
- This will let the resolver recognize Craft/Westers as real destinations instead of leaving them as anonymous clusters.

3. Make Geo (start/slut) truthful again
- Update `GeoAtTime` in `src/components/staff/StaffTimeReportsTable.tsx` to use the corrected timestamps.
- For travel hits, show labels from the adjacent resolved visits/addresses instead of generic `plats → plats`.
- If a label is still unresolved, show a clear fallback like `okänd plats` rather than implying a known site.

4. Keep the GPS detail panel aligned with the same truth model
- Update `src/hooks/useDayPlaceVisits.ts` and `src/components/staff/GpsStopsRows.tsx` so the timeline, travel rows, and expanded ping details all use the same place catalog and label rules.
- Ensure a route like `Warehouse → lunch → Westers` appears as:
  - visit at real address/site
  - travel segment
  - visit at lunch address
  - travel segment
  - visit at Westers

5. Add thorough regression tests
- Extend `src/lib/staff/__tests__/dayTimeline.test.ts` with timezone-sensitive cases:
  - Stockholm local report time resolves to the correct UTC ping window
  - no false `travel` when a report starts inside a real visit
  - still returns `travel` when the timestamp truly falls between visits
- Add focused tests for travel label formatting so booking destinations do not degrade to `plats` when coordinates exist.
- Add a DST-safe test case so this does not break on CET/CEST transitions.

6. Validate against the real failing case before delivery
- Re-check the Ivars 2026-05-03 scenario after implementation:
  - the 05:06 and 08:47 Craft rows must resolve to Craft/site address, not travel
  - the 12:10 Westers row must resolve to Westers/site address once the person is actually there
  - only genuine movement gaps should show as `Resa`
  - expanded rows must still show each ping with timestamp and address

Technical details
- Confirmed during inspection:
  - `StaffTimeReports.tsx` currently builds report timestamps with `new Date(y, m, d, hh, mm, ss).toISOString()`, which depends on the client timezone.
  - `useDayPlaceVisits()` currently only feeds `organization_locations` into `buildPlaceVisits()`.
  - In the database, only one active `organization_locations` row exists right now: `FA Warehouse`.
  - Ivars has 932 GPS pings on 2026-05-03, and the backfilled reports are stored in local Stockholm times (`05:06`, `08:47`, `12:10`).
- That combination explains why the pings look correct while the Tidrapporter table now says almost everything is `Resa`.

When you approve, I’ll implement the fix and run the regression checks carefully.