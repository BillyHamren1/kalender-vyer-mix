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
  /** Active label — pure white for readable small text on black. */
  active: 'hsl(0 0% 100%)',
  /**
   * Inactive icon/label — crisp near-white on black (≈14:1), matching the
   * HUB top bar fix (commit abab70a) so inactive items stay readable.
   */
  inactive: 'hsl(210 10% 88%)',
  /** Soft white tint behind the active icon. */
  activeTint: 'hsl(0 0% 100% / 0.12)',
  /**
   * Bright teal for dark surfaces (HUB --ef-teal-bright, 184 55% 55% ≈
   * #4DC3CB). ≈9:1 on the black bar — icons, buttons and the active
   * indicator stay visible instead of disappearing like the base teal
   * #1F747A (≈3.8:1) did. Light-canvas surfaces keep the base teal.
   */
  bright: '#4DC3CB',
  /**
   * Active marker/indicator on the black bar — the bright teal variant.
   * Labels stay white/near-white so small text is never teal on black.
    */
  activeMarker: '#4DC3CB',
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
