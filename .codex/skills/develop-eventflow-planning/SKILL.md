---
name: develop-eventflow-planning
description: Safely analyze, design, implement, test, and review EventFlow Planning in BillyHamren1/kalender-vyer-mix, including the project workspace, booking read model, simple tasks, staffing calendars, suppliers, supplier dialogue, and transport. Use for any Planning project or calendar change; do not use it to move ownership away from Booking, WMS, Time, or BRAIN.
---

# Develop EventFlow Planning

Treat Planning as EventFlow's operational project-control room. It turns an accepted booking into executable work. It is not a general project-management suite, a duplicate Booking view, or a transport application.

## Read the relevant contract first

- For a project page, project navigation, or information hierarchy, read [references/project-workspace.md](references/project-workspace.md).
- For fields, sync, suppliers, mail, organization isolation, or cross-module behavior, read [references/data-ownership.md](references/data-ownership.md).
- For color, layout, spacing, cards, headers, or visual priority, read [references/ui-contract.md](references/ui-contract.md).
- When Lovable may be editing the same repository, also use `$coordinate-eventflow-lovable` before changing or publishing anything.

Respect analysis-only instructions literally. Inspection and explanation do not authorize code, database, deployment, email, or GitHub mutations.

## Product rules

- Preserve one clear canonical project workspace. Every ordinary route into a project must resolve to it; specialized establishment and economy routes may remain separate.
- Keep complete operational booking information available. Do not remove delivery address, delivery contact and phone, rig/event/rig-down dates and times, booking rows, access/ground-nail/exact-time data, images, files, or internal information.
- Make project planning simple: clear next actions, small todos, staffing via the calendar, supplier follow-up, and compact transport handling. Do not add generic phases, KPI dashboards, kanban, dependencies, or advanced project-management controls unless the user asks.
- Judge additions in the context of the whole page. A newly implemented feature does not automatically get the first position, full width, a hero empty state, or its own dashboard.
- Combine closely related information. A supplier, its request, reply, and status belong to one coherent work area rather than separate empty cards.
- Use one user action for one workflow. Avoid duplicate buttons that open the same action and duplicate todos that merely restate a visible action.

## Change workflow

1. Establish the current remote main commit and inspect later Lovable changes before drawing conclusions.
2. Map the requested change into the existing project hierarchy and name what should remain untouched.
3. Inspect the current data owner and existing service before adding a table, cache, field, or integration.
4. Implement the smallest coherent vertical flow. Preserve old records and legacy fallbacks when production data already uses them.
5. Verify behavior using read-only historical data or a transaction that is rolled back. Never seed or rewrite production history merely to make a test pass.
6. Render the affected page at desktop size and inspect visual hierarchy, empty states, repetition, and color—not only compilation and unit tests.
7. Run focused tests, TypeScript checks, a production build, and diff review. Confirm that files outside the authorized scope did not change.

## Completion standard

A change is not complete because its isolated function works. It is complete when the project remains understandable as a whole, the correct module owns each datum, historical bookings still flow, the UI does not overstate the new feature, and all entry routes show the intended workspace.
