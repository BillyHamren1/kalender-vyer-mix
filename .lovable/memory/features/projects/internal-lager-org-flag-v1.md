---
name: Internal Lager Org Flag
description: Konstanta interna Lager-projektet styrs av organizations.internal_lager_enabled — på endast för Frans August; aldrig auto-skapande eller synligt för andra orger
type: feature
---
Det interna "Lager"-projektet (projects.is_internal=true) är organisationsstyrt via `organizations.internal_lager_enabled` (default false, på för Frans August `f5e5cade-f08b-4833-a105-56461f15b191`).

- DB: `org_internal_lager_enabled(org)` helper (ej klientanropbar); `create_internal_project_for_new_org`, `ensure_internal_project` och `ensure_internal_lager_setup` skapar inget nytt internt Lager-upplägg om flaggan är av. Befintliga rader raderas ALDRIG — de döljs.
- Frontend: `useInternalLagerEnabled()` (src/hooks/useInternalLagerEnabled.ts) gates `useInternalLagerCalendarEvents` (dagliga 07–16-blocket) och filtrerar interna projekt i `UnifiedProjectList`.
- Mobile: `mobile-app-api` get_bookings Lager-bron kräver flaggan.
- Låst av src/__tests__/internalLagerOrgFlag.static.test.ts.
