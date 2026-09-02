# EventFlow Planning UI Standard v1.0

Status: BINDANDE
Canonical platform owner: EventFlow HUB
Module accent: #7357C8 (base), #6849BE (dark text/action)

## Mandatory platform foundation
- Brand mark: #4AA0B5
- Accessible primary action: #2C8F96 unless the module accent is the approved primary action color
- Canvas: #F5F8F9
- Surface: #FFFFFF
- Border: #DCE5E7
- Primary text: #173638
- Secondary text: #5D7074
- Desktop shell: 56 px topbar, 264 px white sidebar, continuous L-shaped shell
- Geometry: 8 px controls, 12 px cards, 16 px dialogs
- Typography: Inter/system; 14 px body, 13 px data, 22–24 px page title
- Full-width operational canvas; no page-level max-width or card wrapper
- Module color is an accent; semantic status colors retain platform meaning
- Loading, empty, error, offline/stale and disabled states must be explicit and honest

## Module-specific rule
Planning uses the canonical HUB violet family only as module identity: active navigation, module icon/brand, focus/ring and the primary module action. Base #7357C8, dark text/action #6849BE. Teal must not be used as a local fallback for Planning identity. Its sidebar must be 264 px, not a locally invented width. Calendars and project workspaces use the full available canvas. Purple must not replace semantic warning, success or error colors. Planning remains the owner of desktop Time administration.

## Implementation order
1. Align tokens without changing behavior.
2. Align shell/sidebar/header and remove duplicate chrome.
3. Normalize the most-used work surfaces.
4. Normalize fallback authentication/loading/error states.
5. Verify 1440 × 900 and 1920 × 1080; mobile modules also verify 390 × 844.
6. Run existing functional tests and compare flows before/after.

## Acceptance checklist
- correct module accent
- same EventFlow typography, geometry and neutral surfaces
- no excess grey nesting
- no duplicated platform header/account/module switcher
- no visual status contradiction
- no technical implementation copy in primary user UI
- no change to domain ownership, SSO, routes or business behavior
- focus, contrast, keyboard/touch behavior verified

Route/context aware tokens: Planning and Lager live in the same app, so the accent follows the route via `data-module` on `<html>` (`src/hooks/useModuleTheme.ts`) and the tokens in `src/styles/module-accents.css`. Sidebar accents come from `src/lib/layout/moduleAccents.ts`. The Lager counterpart is docs/ui/WAREHOUSE_UI_STANDARD.md.

For full token definitions and cross-module rules, mirror the canonical EventFlow UI Standard maintained by HUB. When a local historical style conflicts with this document, this document wins unless a product-specific rule above explicitly says otherwise.
