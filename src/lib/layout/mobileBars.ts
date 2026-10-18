/**
 * Canonical EventFlow mobile bars (design standard 2026-10-18).
 *
 * ALL mobile shells in this repo (legacy /m Time, Warehouse mobile nav and
 * Scanner presentation surfaces) share the same black top/bottom bars as the
 * HUB global module bar. No per-module teal headers or blurred white bottom
 * bars. Content and form fields stay white; warning/status/calendar colours
 * are untouched.
 *
 * Only visual tokens live here — no navigation, auth or business logic.
 * Locked by src/__tests__/mobileBars.test.ts.
 */

/** Solid near-black bar surface (same family as the HUB global top bar). */
export const MOBILE_BAR = {
  /** Bar background — solid, no gradient, no blur. */
  background: 'hsl(210 6% 8%)',
  /** Discreet hairline separating the bar from content. */
  divider: 'hsl(0 0% 100% / 0.10)',
  /** Active icon/label — pure white for maximum contrast on black. */
  active: 'hsl(0 0% 100%)',
  /** Inactive icon/label — light gray, still readable on black (>= 4.5:1). */
  inactive: 'hsl(215 10% 72%)',
  /** Soft white tint behind the active icon. */
  activeTint: 'hsl(0 0% 100% / 0.12)',
} as const;

/** Shared bottom-bar container style (solid black, hairline top divider). */
export function mobileBottomBarStyle(): React.CSSProperties {
  return {
    background: MOBILE_BAR.background,
    borderTop: `1px solid ${MOBILE_BAR.divider}`,
    boxShadow: 'none',
  };
}

/** Shared top-bar / safe-area style (solid black). */
export function mobileTopBarStyle(): React.CSSProperties {
  return {
    background: MOBILE_BAR.background,
  };
}
