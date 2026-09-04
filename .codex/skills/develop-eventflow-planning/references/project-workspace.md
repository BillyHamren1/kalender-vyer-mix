# Planning project workspace

## Purpose

The project workspace answers four practical questions in order:

1. What has been booked and where/when will it happen?
2. What must we do next?
3. Who, which supplier, and which transport will execute it?
4. What has been communicated, changed, or completed?

Booking information is required planning input. It must remain complete, but Planning must not become a second commercial booking editor.

## Canonical structure

Use one compact project header followed by two primary views.

### Booking information

Show the complete operational read model:

- customer and booking number;
- full delivery address;
- delivery contact, phone, and email;
- rig, event, and rig-down dates and times;
- carry/access information, ground-nail permission, exact-time requirements, and similar delivery constraints;
- booking rows with product/service, quantity, accessories, and relevant notes;
- booking images, attachments, and project files;
- internal information used by the delivery team.

This view should be easy to scan and should not hide critical facts behind several clicks.

### Project planning

Order content by operational importance, not by implementation recency:

1. next actions and small todos;
2. staffing status with a clear route to the personnel calendar;
3. suppliers and their communication/status in one area;
4. transport as a compact section or status row;
5. history or completed items when useful.

Avoid large empty cards. An empty supporting function should normally be a concise row with one action, not a full-width dashboard.

## Transport contract

Transport is one part of planning.

- Provide one entry action: `Lägg till transport`.
- First choice: `Intern transport` or `Extern transport`.
- Internal transport saves immediately; it requires no supplier, vehicle, cargo, or email fields.
- External transport reveals a focused flow: choose/create supplier, vehicle or cargo size, other delivery information, then a premade editable email for review and sending.
- After creation, show a compact status with internal/external, date/time, route, supplier when external, request/reply status, and the minimum useful cargo detail.
- Do not place two equivalent transport buttons on the same empty state.
- If a default todo says `Boka transport`, complete or reconcile it when a real transport assignment exists; do not show contradictory duplicate work.

## Suppliers and dialogue

Show the linked supplier and the latest request/reply together. The user should be able to see whom they contacted, what is pending, and the answer without scanning separate supplier and dialogue dashboards.

## Navigation invariant

Dashboard cards, project lists, search results, calendar links, and legacy project URLs must resolve to the same canonical overview. Specialized establishment/execution/economy pages may have separate routes, but there must not be two competing project overview implementations.
