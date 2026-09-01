/**
 * Canonical EventFlow sidebar contract.
 *
 * These values are LOCKED by src/__tests__/sidebarContract.test.ts so the
 * module sidebar always lines up with the EventFlow HUB topbar brand column
 * (264px) and forms one continuous L-shaped shell.
 *
 * Only visual/layout tokens live here — no navigation, auth or business logic.
 */

export const SIDEBAR_CONTRACT = {
  /** Desktop sidebar width — must match HUB brand column exactly. */
  widthPx: 264,
  /** Icon-only (collapsed) width — existing behaviour preserved. */
  collapsedWidthPx: 60,
  /** Standard menu row height. */
  rowHeightPx: 40,
  /** Outline icon size. */
  iconSizePx: 18,
  /** Section heading typography. */
  sectionLabelSizePx: 12,
  sectionLabelTracking: '0.08em',
  /** Menu label typography. */
  labelSizePx: 14,
  /** Vertical gap between rows. */
  rowGapPx: 2,
  /** Row corner radius. */
  rowRadiusPx: 8,

  /** Active row left indicator. */
  activeLeftBarPx: 3,
  /** Horizontal padding inside the sidebar rail. */
  railPaddingPx: 12,
  /** Row horizontal padding (label alignment). */
  rowPaddingXPx: 10,
  /** Nested navigation guide. */
  nestedIndentPx: 18,
  nestedGuideWidthPx: 1,
} as const;

/** Neutral cool-gray surfaces shared by every module context. */
export const SIDEBAR_SURFACE = {
  /** Pure white, continuous from the top of the module content. */
  background: 'hsl(0 0% 100%)',
  /** 1px neutral cool-gray divider on the right edge. */
  divider: 'hsl(214 15% 89%)',
  /** Soft right-side elevation that meets the HUB topbar shadow. */
  shadow:
    '2px 0 5px hsl(215 20% 30% / 0.05), 8px 0 20px hsl(215 20% 30% / 0.03)',
  /** Recessed work canvas to the right of the sidebar. */
  canvas: 'hsl(210 20% 98%)',
  sectionLabelColor: 'hsl(215 12% 46%)',
  labelColor: 'hsl(215 16% 27%)',
  iconColor: 'hsl(215 12% 46%)',
  nestedGuide: 'hsl(214 15% 90%)',
} as const;

export interface SidebarAccent {
  /** Accent used for active icon + text. */
  base: string;
  /** Very light tint of the module accent for the active row. */
  soft: string;
  /** Discreet 1px accent border on the active row. */
  border: string;
  /** Very faint accent hover tone. */
  hover: string;
  /** Focus-visible ring colour. */
  ring: string;
}

/** Planering — purple module accent. */
export const PLANNING_ACCENT: SidebarAccent = {
  base: 'hsl(272 45% 42%)',
  soft: 'hsl(270 55% 97%)',
  border: 'hsl(270 40% 89%)',
  hover: 'hsl(270 45% 98%)',
  ring: 'hsl(272 45% 52%)',
};

/** Lager & Logistik — warm orange module accent. */
export const WAREHOUSE_ACCENT: SidebarAccent = {
  base: 'hsl(30 82% 42%)',
  soft: 'hsl(38 92% 96%)',
  border: 'hsl(38 70% 84%)',
  hover: 'hsl(38 80% 97%)',
  ring: 'hsl(32 85% 48%)',
};

/** Outer <aside> surface style. */
export function sidebarSurfaceStyle(): React.CSSProperties {
  return {
    background: SIDEBAR_SURFACE.background,
    borderRight: `1px solid ${SIDEBAR_SURFACE.divider}`,
    boxShadow: SIDEBAR_SURFACE.shadow,
  };
}

/** Section heading style — 12px uppercase, 0.08em tracking. */
export function sidebarSectionLabelStyle(): React.CSSProperties {
  return {
    fontSize: SIDEBAR_CONTRACT.sectionLabelSizePx,
    lineHeight: 1.2,
    textTransform: 'uppercase',
    letterSpacing: SIDEBAR_CONTRACT.sectionLabelTracking,
    fontWeight: 600,
    color: SIDEBAR_SURFACE.sectionLabelColor,
    paddingLeft: SIDEBAR_CONTRACT.rowPaddingXPx,
    paddingRight: SIDEBAR_CONTRACT.rowPaddingXPx,
  };
}

interface RowStyleArgs {
  active: boolean;
  hovered?: boolean;
  collapsed?: boolean;
  accent: SidebarAccent;
}

/**
 * Standard menu row — 40px high, 8px radius, 3px accent left line when active.
 * Rows NEVER render a border/outline/ring — only background tint changes.
 */
export function sidebarRowStyle({
  active,
  hovered,
  collapsed,
  accent,
}: RowStyleArgs): React.CSSProperties {
  return {
    position: 'relative',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? 0 : 10,
    width: '100%',
    minHeight: SIDEBAR_CONTRACT.rowHeightPx,
    height: SIDEBAR_CONTRACT.rowHeightPx,
    paddingLeft: collapsed ? 0 : SIDEBAR_CONTRACT.rowPaddingXPx,
    paddingRight: collapsed ? 0 : SIDEBAR_CONTRACT.rowPaddingXPx,
    justifyContent: collapsed ? 'center' : 'flex-start',
    textAlign: 'left',
    borderRadius: SIDEBAR_CONTRACT.rowRadiusPx,
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    fontSize: SIDEBAR_CONTRACT.labelSizePx,
    fontWeight: active ? 600 : 500,
    background: active ? accent.soft : hovered ? accent.hover : 'transparent',
    color: active ? accent.base : SIDEBAR_SURFACE.labelColor,
    transition: 'background 150ms ease, color 150ms ease',
    cursor: 'pointer',
  };
}

/** 3px accent left line rendered inside an active row. */
export function sidebarActiveBarStyle(accent: SidebarAccent): React.CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: SIDEBAR_CONTRACT.activeLeftBarPx,
    borderRadius: SIDEBAR_CONTRACT.activeLeftBarPx,
    background: accent.base,
  };
}

/** Nested navigation container — thin vertical guide + consistent indent. */
export function sidebarNestedContainerStyle(): React.CSSProperties {
  return {
    marginLeft: SIDEBAR_CONTRACT.nestedIndentPx,
    paddingLeft: SIDEBAR_CONTRACT.rowPaddingXPx,
    borderLeft: `${SIDEBAR_CONTRACT.nestedGuideWidthPx}px solid ${SIDEBAR_SURFACE.nestedGuide}`,
  };
}

/** Nested row — same 40px interaction height, no border. */
export function sidebarNestedRowStyle({
  active,
  hovered,
  accent,
}: Omit<RowStyleArgs, 'collapsed'>): React.CSSProperties {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: SIDEBAR_CONTRACT.rowHeightPx,
    height: SIDEBAR_CONTRACT.rowHeightPx,
    boxSizing: 'border-box',
    paddingLeft: SIDEBAR_CONTRACT.rowPaddingXPx,
    paddingRight: SIDEBAR_CONTRACT.rowPaddingXPx,
    borderRadius: SIDEBAR_CONTRACT.rowRadiusPx,
    border: 'none',
    outline: 'none',
    boxShadow: 'none',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? accent.base : SIDEBAR_SURFACE.labelColor,
    background: active ? accent.soft : hovered ? accent.hover : 'transparent',
    transition: 'background 150ms ease',
  };
}

/**
 * Resolves EXACTLY ONE active navigation url for a pathname.
 * Longest matching url wins; ties resolve to the first declared item.
 */
/**
 * Resolves EXACTLY ONE active navigation entry for a pathname.
 * `exact` entries only match the exact path. Longest matching url wins;
 * ties resolve to the first declared entry. Returns -1 when nothing matches.
 */
export function resolveActiveNavIndex(
  pathname: string,
  entries: ReadonlyArray<{ url: string; exact?: boolean }>
): number {
  let bestIndex = -1;
  let bestLength = -1;
  entries.forEach((entry, index) => {
    const matches = entry.exact
      ? pathname === entry.url
      : pathname === entry.url || pathname.startsWith(entry.url + '/');
    if (!matches) return;
    if (entry.url.length > bestLength) {
      bestLength = entry.url.length;
      bestIndex = index;
    }
  });
  return bestIndex;
}


/** Shared focus-visible class (no layout shift — uses outline offset). */
export const SIDEBAR_FOCUS_CLASS =
  'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]';

