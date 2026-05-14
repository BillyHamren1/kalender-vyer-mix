import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  type LucideIcon,
  TrendingUp,
  Calendar,
  Users,
  Receipt,
  Sparkles,
  PenTool,
  ChevronDown,
  ChevronsLeft,
  FolderKanban,
  PieChart,
  Truck,
  AlertCircle,
  Clock,
  CalendarDays,
  MapPin,
  Activity,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useProjectInboxCount } from "@/hooks/useProjectInboxCount";
import { useUnplannedProjects } from "@/hooks/useUnplannedProjects";

interface NavChild {
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: number;
}

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: number;
  children?: NavChild[];
}

const baseNavigationItems: NavItem[] = [
  {
    title: "Projekt",
    url: "/projects",
    icon: FolderKanban,
    children: [
      { title: "Mina projekt", url: "/my-projects" },
      { title: "Projektöversikt", url: "/economy", icon: Wallet },
    ],
  },
  {
    title: "Logistikplanering",
    url: "/ops-control",
    icon: Users,
  },
  {
    title: "Personalplanering",
    url: "/calendar",
    icon: Calendar,
  },
  {
    title: "Transportplanering",
    url: "/logistics/planning",
    icon: Truck,
  },
  {
    title: "Personal",
    url: "/staff-management",
    icon: Users,
    children: [
      { title: "Personalöversikt", url: "/staff-management", icon: Users },
      { title: "Personalplanering", url: "/calendar", icon: Calendar },
      { title: "Personalkalendern (publik)", url: "/personalkalendern", icon: ExternalLink },
      { title: "Tidrapporter", url: "/staff-management/time-reports", icon: Clock },
    ],
  },
  {
    title: "Ekonomiöversikt",
    url: "/economy",
    icon: PieChart,
  },
];

// Badge count now comes from shared useProjectInboxCount hook

/* ─── Collapsed Tooltip ─── */
function CollapsedTooltip({ label, show }: { label: string; show: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-full ml-3 px-3 py-2 rounded-[8px] pointer-events-none",
        "bg-foreground text-background text-sm font-medium whitespace-nowrap",
        "transition-opacity duration-200",
        show ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 -left-[14px]"
        style={{
          width: 0,
          height: 0,
          borderWidth: 8,
          borderStyle: "solid",
          borderColor: "transparent hsl(var(--foreground)) transparent transparent",
        }}
      />
      {label}
    </div>
  );
}

export function Sidebar3D() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const [pressedUrl, setPressedUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const unviewedCount = useProjectInboxCount();
  const { data: unplannedProjects = [] } = useUnplannedProjects();
  const unplannedCount = unplannedProjects.length;

  const navigationItems = baseNavigationItems.map(item => {
    if (item.url === '/projects' && unviewedCount > 0) {
      return { ...item, badge: unviewedCount };
    }
    if (item.url === '/calendar' && unplannedCount > 0) {
      return { ...item, badge: unplannedCount };
    }
    return item;
  });

  // Auto-expand parent if a child route is active
  useEffect(() => {
    navigationItems.forEach((item) => {
      if (item.children?.some((child) => location.pathname === child.url)) {
        setExpandedItems((prev) =>
          prev.includes(item.url) ? prev : [...prev, item.url]
        );
      }
    });
  }, [location.pathname]);

  const toggleExpanded = (url: string) => {
    setExpandedItems((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const isItemActive = (item: NavItem) => {
    if (item.children?.length) {
      // Only highlight parent if it's the exact route, not when a child is active
      return location.pathname === item.url;
    }
    return (
      location.pathname === item.url ||
      location.pathname.startsWith(item.url + "/")
    );
  };

  const isChildActive = (url: string) => location.pathname === url;

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={cn(
          "sticky top-0 z-30 h-screen shrink-0 self-start flex-col transition-all duration-500 ease-out",
          "hidden lg:flex theme-purple",
          isCollapsed ? "w-14" : "w-48"
        )}
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        {/* Right edge separator */}
        <div
          className="absolute right-0 top-0 bottom-0 w-px"
          style={{ background: "hsl(200 18% 66%)" }}
        />

        {/* Collapse/Expand Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={cn(
            "absolute -right-4 z-50 flex items-center justify-center",
            "w-8 h-8 rounded-full bg-card border-2 border-primary text-primary shadow-md",
            "hover:shadow-lg hover:scale-110 transition-all"
          )}
          style={{ top: 36 }}
          title={isCollapsed ? "Expandera sidebar" : "Dölj sidebar"}
        >
          <ChevronsLeft
            className={cn(
              "w-4 h-4 transition-transform duration-300",
              isCollapsed && "rotate-180"
            )}
          />
        </button>

        {/* Top padding */}
        <div className="pt-4 pb-1" />

        {/* Navigation */}
        <nav className="flex-1 px-2 pt-2 pb-4 space-y-px overflow-y-auto">
          {navigationItems.map((item) => {
            const hasChildren = !!item.children?.length;
            const hasActiveChild =
              hasChildren &&
              item.children!.some(
                (child) =>
                  location.pathname === child.url ||
                  location.pathname.startsWith(child.url + "/")
              );
            const active = isItemActive(item);
            const expanded = expandedItems.includes(item.url);
            const hovered = hoveredUrl === item.url;
            const pressed = pressedUrl === item.url;

            const sharedMouseProps = {
              onMouseEnter: () => setHoveredUrl(item.url),
              onMouseLeave: () => {
                setHoveredUrl(null);
                setPressedUrl(null);
              },
              onMouseDown: () => setPressedUrl(item.url),
              onMouseUp: () => setPressedUrl(null),
            };

            /* ── Icon ── */
            const iconEl = (
              <div className="shrink-0 flex items-center justify-center w-4 h-4">
                <item.icon
                  className={cn(
                    "w-[14px] h-[14px]",
                    active
                      ? "text-primary"
                      : hasActiveChild
                        ? "text-foreground/55"
                        : "text-foreground/60"
                  )}
                  strokeWidth={1.8}
                />
              </div>
            );

            /* ── Label ── */
            const labelEl = !isCollapsed && (
              <span
                className={cn(
                  "text-[13px] leading-none tracking-[-0.005em] truncate flex-1",
                  active
                    ? "font-semibold text-foreground"
                    : hasActiveChild
                      ? "font-medium text-foreground/[0.68]"
                      : "font-medium text-foreground/[0.72]"
                )}
              >
                {item.title}
              </span>
            );

            /* ── Badge ── */
            const badgeEl = item.badge ? (
              isCollapsed ? (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
              ) : (
                <span className="h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1 flex items-center justify-center">
                  {item.badge}
                </span>
              )
            ) : null;

            /* ── Item classes ── */
            const itemClassName = cn(
              "relative flex items-center justify-start gap-2.5 rounded-md text-left transition-all duration-150",
              isCollapsed
                ? "justify-center px-2 py-[10px]"
                : active
                  ? "py-[9px] pl-[7px] pr-2"
                  : "py-[9px] pl-[9px] pr-2"
            );

            /* ── Active/hover/press styles ── */
            const itemStyle: React.CSSProperties = active
              ? {
                  background: "hsl(200 14% 93%)",
                  borderLeft: "2.5px solid hsl(var(--primary))",
                }
              : hasActiveChild
                ? {
                    borderLeft: "2px solid transparent",
                  }
                : {
                    borderLeft: "2px solid transparent",
                    ...(pressed
                      ? { background: "hsl(200 14% 50% / 0.13)" }
                      : hovered
                        ? { background: "hsl(200 14% 50% / 0.08)" }
                        : {}),
                  };

            return (
              <div key={item.url} className="relative">
                {hasChildren ? (
                  <button
                    onClick={() => {
                      navigate(item.url);
                      toggleExpanded(item.url);
                    }}
                    className={cn(itemClassName, "w-full")}
                    style={itemStyle}
                    {...sharedMouseProps}
                  >
                    {iconEl}
                    {labelEl}
                    {badgeEl}
                    {!isCollapsed && (
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-200",
                          expanded && "rotate-180"
                        )}
                      />
                    )}
                    {isCollapsed && (
                      <CollapsedTooltip label={item.title} show={hovered} />
                    )}
                  </button>
                ) : (
                  <NavLink
                    to={item.url}
                    className={cn(itemClassName)}
                    style={itemStyle}
                    {...sharedMouseProps}
                  >
                    {iconEl}
                    {labelEl}
                    {badgeEl}
                    {isCollapsed && (
                      <CollapsedTooltip label={item.title} show={hovered} />
                    )}
                  </NavLink>
                )}

                {/* ── Sub-items ── */}
                {hasChildren && !isCollapsed && expanded && (
                  <div className="ml-5 pl-3 border-l border-border/40 space-y-0.5 mt-0.5">
                    {item.children!.map((child) => {
                      const childActive = isChildActive(child.url);
                      return (
                        <NavLink
                          key={child.url}
                          to={child.url}
                          className={cn(
                            "flex items-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[12px] transition-colors",
                            childActive
                              ? "border-primary/40 bg-primary/15 text-primary font-semibold"
                              : "border-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                          )}
                          onMouseEnter={() => setHoveredUrl(child.url)}
                          onMouseLeave={() => setHoveredUrl(null)}
                        >
                          {child.icon && (
                            <child.icon className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{child.title}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Divider + Bottom Section ── */}
        <div
          className="mx-0"
          style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
        >
          <div className="p-4" />
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden theme-purple"
        style={{
          background: "hsl(var(--sidebar-background) / 0.90)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid hsl(var(--border) / 0.50)",
          boxShadow:
            "0 -1px 0 hsl(200 14% 82%), 0 -4px 12px hsl(200 20% 15% / 0.08)",
        }}
      >
        <div className="flex items-center justify-around py-2 px-4">
          {navigationItems.filter((_, i) => i <= 4).map((item) => {
            const hasChildren = !!item.children?.length;
            const active = hasChildren
              ? item.children!.some(
                  (child) => location.pathname === child.url
                )
              : location.pathname === item.url ||
                location.pathname.startsWith(item.url + "/");
            const targetUrl = hasChildren ? item.children![0].url : item.url;

            return (
              <NavLink
                key={item.url}
                to={targetUrl}
                className="relative flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all duration-150"
              >
                {active && (
                  <div
                    className="absolute inset-0 rounded-xl"
                    style={{ background: "hsl(var(--primary) / 0.08)" }}
                  />
                )}
                {item.badge && (
                  <span className="absolute top-1.5 right-2 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background z-20" />
                )}
                <item.icon
                  size={20}
                  className="relative z-10"
                  color={active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                />
                <span
                  className="relative z-10 truncate max-w-[4rem] font-medium"
                  style={{
                    fontSize: 10,
                    color: active
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted-foreground))",
                  }}
                >
                  {item.title}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
