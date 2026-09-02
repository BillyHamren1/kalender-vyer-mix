# EventFlow Lager (Warehouse) UI Standard v1.0

Status: BINDANDE
Canonical platform owner: EventFlow HUB
Module accent: #C77922 (base), #9A5715 (dark text/action)

## Mandatory platform foundation
Same as the Planning standard: brand mark #4AA0B5, canvas #F5F8F9, surface #FFFFFF, border #DCE5E7, primary text #173638, secondary text #5D7074, 56 px topbar, 264 px white sidebar, 8/12/16 px geometry, Inter/system typography, full-width operational canvas.

## Module-specific rule
Lager uses the warm orange family only as module identity: active navigation, module icon/brand, focus/ring and the primary module action. Neutral surfaces stay neutral, and semantic success/warning/error colours keep their platform meaning — the module accent must never colour status. Teal must not be used as a local fallback for Lager identity.

## Implementation
Route/context aware tokens: Planning and Lager live in the same app, so the accent follows the route via `data-module` on `<html>` (`src/hooks/useModuleTheme.ts`) and the tokens in `src/styles/module-accents.css`. Sidebar accents come from `src/lib/layout/moduleAccents.ts`.

## Acceptance checklist
- correct module accent (#C77922 / #9A5715)
- no teal in module identity surfaces
- semantic status colours unchanged
- no change to warehouse/calendar logic, routes, SSO or data ownership
- focus, contrast, keyboard/touch behavior verified
