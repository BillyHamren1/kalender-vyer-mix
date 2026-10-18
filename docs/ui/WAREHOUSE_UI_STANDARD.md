# EventFlow Lager (Warehouse) UI Standard v1.0

> ERSATT 2026-10-18: docs/design/EVENTFLOW-DESIGN-STANDARD.md gäller vid konflikt (gemensam teal-accent, inga egna modulfärger).

Status: BINDANDE
Canonical platform owner: EventFlow HUB
Module accent: shared teal #1F747A (base), #156065 (dark text/action) — standard 2026-10-18

## Mandatory platform foundation
Same as the Planning standard: brand mark #4AA0B5, canvas #F5F8F9, surface #FFFFFF, border #DCE5E7, primary text #173638, secondary text #5D7074, 56 px topbar, 264 px white sidebar, 8/12/16 px geometry, Inter/system typography, full-width operational canvas.

## Module-specific rule
Lager uses the shared HUB teal family only as module identity: active navigation, module icon/brand, focus/ring and the primary module action. Neutral surfaces stay neutral, and semantic success/warning/error colours keep their platform meaning — the module accent must never colour status. Per-module colours (warm orange) must not be used as local fallbacks — one shared accent in all modules.

## Implementation
Route/context aware tokens: Planning and Lager live in the same app, so the accent follows the route via `data-module` on `<html>` (`src/hooks/useModuleTheme.ts`) and the tokens in `src/styles/module-accents.css`. Sidebar accents come from `src/lib/layout/moduleAccents.ts`.

## Acceptance checklist
- correct shared module accent (#1F747A / #156065)
- no per-module colours in module identity surfaces
- semantic status colours unchanged
- no change to warehouse/calendar logic, routes, SSO or data ownership
- focus, contrast, keyboard/touch behavior verified
