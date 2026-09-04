# Planning UI contract

## Current color status

The exact Planning accent is unresolved until reverified.

The local repository currently labels `#7357C8` as the canonical Planning color, with `#6849BE` as its darker companion. On 2026-09-04 the user explicitly rejected the resulting rendered violet as the wrong/old color. Therefore:

- do not treat a CSS comment, old screenshot, or existing `--primary` value as proof of the approved color;
- do not reuse `#7357C8` merely because the local document calls it canonical;
- verify the current HUB module token and the latest user-approved Planning visual/commit before changing color;
- keep one token source and make Planning consume it instead of redefining competing values in page CSS;
- if the approved source cannot be established, leave color unchanged and explain the ambiguity rather than guessing.

## Visual hierarchy

- Planning uses EventFlow's neutral canvas and white surfaces. Module color is an accent, not a page wash.
- Use the accent for module identity, active navigation/tab, focus, and the main action. Preserve semantic colors for success, warning, error, and status.
- Use a compact header. A full solid-color top container is acceptable only when it is the approved shared project header, not a local invention.
- Use the full operational canvas without a needless max-width wrapper on primary work views.
- Avoid nested cards, giant empty states, duplicated headings, and multiple primary actions competing in one viewport.
- Text and essential actions must remain comfortably readable; secondary text must not become faint decoration.

## Review questions

Before accepting a screenshot, answer:

1. What appears to be the page's main purpose at first glance?
2. Is that purpose the actual Planning job, or only the newest feature?
3. Are booking facts, next actions, staffing, suppliers, and transport balanced according to operational importance?
4. Is any action repeated as both a button and a todo without useful distinction?
5. Does the color come from the verified module source, and is it used only where hierarchy benefits?
6. Does the page remain clear at 1440 × 900 and 1920 × 1080 without large dead zones?
