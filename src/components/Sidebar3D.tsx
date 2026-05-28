import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  type LucideIcon,
  Calendar,
  Users,
  ChevronDown,
  ChevronsLeft,
  FolderKanban,
  PieChart,
  Truck,
  MapPin,
  Wallet,
  ExternalLink,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectInboxCount } from "@/hooks/useProjectInboxCount";
import { useUnplannedProjects } from "@/hooks/useUnplannedProjects";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { usePinnedTabs } from "@/contexts/PinnedTabsContext";
import { Pin, PinOff } from "lucide-react";

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
      { title: "Mina projekt", url: "/my-projects", icon: FolderKanban },
      { title: "Projektöversikt", url: "/economy", icon: Wallet },
    ],
  },
  {
    title: "Logistikplanering",
    url: "/ops-control",
    icon: MapPin,
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
      { title: "Tid & Lön", url: "/staff-management/time", icon: CalendarClock },
    ],
  },
  {
    title: "Ekonomiöversikt",
    url: "/economy",
    icon: PieChart,
  },
];

/* ─── Collapsed Tooltip ─── */
function CollapsedTooltip({ label, show }: { label: string; show: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg pointer-events-none z-50",
        "bg-foreground text-background text-xs font-medium whitespace-nowrap shadow-lg",
        "transition-all duration-150",
        show ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
      )}
    >
      {label}
    </div>
  );
}

export function Sidebar3D() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const unviewedCount = useProjectInboxCount();
  const { data: unplannedProjects = [] } = useUnplannedProjects();
  const unplannedCount = unplannedProjects.length;
  const { addTab, removeTab, hasTab } = usePinnedTabs();

  const navigationItems = baseNavigationItems.map((item) => {
    if (item.url === "/projects") {
      const total = unviewedCount + unplannedCount;
      return total > 0 ? { ...item, badge: total } : item;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleExpanded = (url: string) => {
    setExpandedItems((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const isItemActive = (item: NavItem) => {
    if (item.children?.length) {
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
          "sticky top-0 z-30 h-screen shrink-0 self-start flex-col transition-all duration-300 ease-out",
          "hidden lg:flex theme-purple relative",
          isCollapsed ? "w-[60px]" : "w-[224px]"
        )}
        style={{
          background: "hsl(0 0% 99.5%)",
          borderRight: "1px solid hsl(240 8% 88%)",
          boxShadow: "1px 0 0 hsl(240 8% 94%), 2px 0 8px hsl(240 10% 20% / 0.04)",
        }}
      >
        {/* ── Premium Header (Brand + Module) ── */}
        <div
          className={cn(
            "relative shrink-0 transition-all duration-300",
            isCollapsed ? "px-2 pt-4 pb-3" : "px-3 pt-4 pb-3"
          )}
          style={{ borderBottom: "1px solid hsl(240 8% 92%)" }}
        >

          <div
            className={cn(
              "flex items-center gap-2.5",
              isCollapsed && "justify-center"
            )}
          >
            {/* Avatar */}
            <div
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
              style={{
                background:
                  "linear-gradient(135deg, hsl(270 55% 60%) 0%, hsl(285 55% 45%) 100%)",
                boxShadow:
                  "0 1px 2px hsl(270 40% 25% / 0.18), inset 0 1px 0 hsl(0 0% 100% / 0.25)",
              }}
            >
              <Sparkles className="w-[18px] h-[18px] text-white" strokeWidth={2} />
            </div>

            {!isCollapsed && (
              <div className="flex flex-col min-w-0 leading-tight">
                <span
                  className="text-[13px] font-semibold tracking-tight truncate"
                  style={{ color: "hsl(240 10% 18%)" }}
                >
                  EventFlow
                </span>
                <span
                  className="text-[10.5px] font-medium uppercase tracking-[0.08em] truncate"
                  style={{ color: "hsl(var(--primary))" }}
                >
                  Operations Hub
                </span>
              </div>
            )}

          </div>

          {/* Integrated collapse button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "absolute -right-3 top-7 z-50 flex items-center justify-center",
              "w-6 h-6 rounded-full transition-all duration-200",
              "shadow-sm hover:shadow-md hover:scale-105"
            )}
            style={{
              background: "hsl(0 0% 100%)",
              border: "1px solid hsl(240 8% 84%)",
              color: "hsl(var(--primary))",
            }}

            title={isCollapsed ? "Expandera sidebar" : "Dölj sidebar"}
            aria-label={isCollapsed ? "Expandera sidebar" : "Dölj sidebar"}
          >
            <ChevronsLeft
              className={cn(
                "w-3.5 h-3.5 transition-transform duration-300",
                isCollapsed && "rotate-180"
              )}
              strokeWidth={2.2}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav
          className={cn(
            "flex-1 pt-3 pb-4 overflow-y-auto space-y-0.5",
            isCollapsed ? "px-2" : "px-2.5"
          )}
        >
          {!isCollapsed && (
            <div
              className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "hsl(240 6% 50%)" }}
            >
              Översikt
            </div>
          )}


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

            const sharedMouseProps = {
              onMouseEnter: () => setHoveredUrl(item.url),
              onMouseLeave: () => setHoveredUrl(null),
            };

            const iconEl = (
              <div className="shrink-0 flex items-center justify-center w-[18px] h-[18px]">
                <item.icon
                  className={cn(
                    "w-[16px] h-[16px] transition-colors",
                    active || hasActiveChild
                      ? "text-[hsl(var(--primary))]"
                      : "text-[hsl(240_6%_46%)]"
                  )}
                  strokeWidth={active ? 2.1 : 1.75}
                />
              </div>
            );

            const labelEl = !isCollapsed && (
              <span
                className={cn(
                  "text-[13px] leading-none tracking-[-0.005em] truncate flex-1 transition-colors",
                  active
                    ? "font-semibold text-[hsl(280_45%_28%)]"
                    : hasActiveChild
                      ? "font-medium text-[hsl(240_8%_25%)]"
                      : "font-medium text-[hsl(240_8%_28%)]"
                )}
              >
                {item.title}
              </span>
            );


            const badgeEl = item.badge ? (
              isCollapsed ? (
                <span
                  className="absolute top-1 right-1 h-2 w-2 rounded-full ring-2 ring-white"
                  style={{ background: "hsl(0 75% 58%)" }}
                />
              ) : (
                <span
                  className="h-[18px] min-w-[18px] rounded-full text-[10px] font-bold px-1.5 flex items-center justify-center text-white"
                  style={{ background: "hsl(0 75% 58%)" }}
                >
                  {item.badge}
                </span>
              )
            ) : null;

            const itemClassName = cn(
              "relative flex items-center gap-2.5 rounded-lg text-left transition-all duration-150 group",
              isCollapsed
                ? "justify-center px-2 py-2.5"
                : "py-[9px] pl-2.5 pr-2 w-full"
            );

            const itemStyle: React.CSSProperties = active
              ? {
                  background: "hsl(270 55% 96%)",
                  boxShadow:
                    "inset 0 0 0 1px hsl(270 40% 88%), 0 1px 2px hsl(270 30% 25% / 0.04)",
                }
              : hovered
                ? { background: "hsl(240 8% 95%)" }
                : {};


            const pinned = hasTab(item.url);
            const triggerEl = hasChildren ? (
              <button
                onClick={() => {
                  navigate(item.url);
                  toggleExpanded(item.url);
                }}
                className={itemClassName}
                style={itemStyle}
                {...sharedMouseProps}
              >
                {iconEl}
                {labelEl}
                {badgeEl}
                {!isCollapsed && (
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                      expanded ? "rotate-180" : "",
                      active || hasActiveChild
                        ? "text-[hsl(var(--primary))]"
                        : "text-[hsl(240_6%_55%)]"
                    )}
                    strokeWidth={2}
                  />
                )}
                {isCollapsed && (
                  <CollapsedTooltip label={item.title} show={hovered} />
                )}
              </button>
            ) : (
              <NavLink
                to={item.url}
                className={itemClassName}
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
            );

            return (
              <div key={item.url} className="relative">
                <ContextMenu>
                  <ContextMenuTrigger asChild>{triggerEl}</ContextMenuTrigger>
                  <ContextMenuContent>
                    {pinned ? (
                      <ContextMenuItem onSelect={() => removeTab(item.url)}>
                        <PinOff className="w-3.5 h-3.5 mr-2" /> Ta bort tabb
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem
                        onSelect={() => addTab({ path: item.url, title: item.title })}
                      >
                        <Pin className="w-3.5 h-3.5 mr-2" /> Spara som tabb
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>

                {/* Sub-items */}
                {hasChildren && !isCollapsed && expanded && (
                  <div
                    className="mt-1 mb-1 ml-[18px] pl-3 space-y-0.5"
                    style={{ borderLeft: "1px solid hsl(240 8% 90%)" }}
                  >
                    {item.children!.map((child) => {
                      const childActive = isChildActive(child.url);
                      const childPinned = hasTab(child.url);
                      return (
                        <ContextMenu key={child.url}>
                          <ContextMenuTrigger asChild>
                            <NavLink
                              to={child.url}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-all duration-150"
                              )}
                              style={
                                childActive
                                  ? {
                                      background: "hsl(270 55% 96%)",
                                      color: "hsl(280 50% 28%)",
                                      fontWeight: 600,
                                    }
                                  : {
                                      color: "hsl(240 8% 38%)",
                                    }
                              }
                              onMouseEnter={(e) => {
                                if (!childActive)
                                  (e.currentTarget as HTMLElement).style.background =
                                    "hsl(240 8% 95%)";
                              }}
                              onMouseLeave={(e) => {
                                if (!childActive)
                                  (e.currentTarget as HTMLElement).style.background =
                                    "transparent";
                              }}
                            >
                              {child.icon && (
                                <child.icon
                                  className="w-3.5 h-3.5 shrink-0"
                                  strokeWidth={childActive ? 2.1 : 1.75}
                                  style={{
                                    color: childActive
                                      ? "hsl(var(--primary))"
                                      : "hsl(240 6% 52%)",
                                  }}
                                />
                              )}
                              <span className="truncate">{child.title}</span>
                            </NavLink>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            {childPinned ? (
                              <ContextMenuItem onSelect={() => removeTab(child.url)}>
                                <PinOff className="w-3.5 h-3.5 mr-2" /> Ta bort tabb
                              </ContextMenuItem>
                            ) : (
                              <ContextMenuItem
                                onSelect={() =>
                                  addTab({ path: child.url, title: child.title })
                                }
                              >
                                <Pin className="w-3.5 h-3.5 mr-2" /> Spara som tabb
                              </ContextMenuItem>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Bottom subtle footer ── */}
        <div
          className="shrink-0 px-3 py-2.5"
          style={{ borderTop: "1px solid hsl(240 8% 92%)" }}
        >
          {!isCollapsed ? (
            <div
              className="text-[10px] font-medium tracking-wide"
              style={{ color: "hsl(240 6% 55%)" }}
            >
              v2 · Planning
            </div>
          ) : (
            <div
              className="h-1.5 w-1.5 rounded-full mx-auto"
              style={{ background: "hsl(var(--primary) / 0.4)" }}
            />
          )}
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden theme-purple"
        style={{
          background: "hsl(0 0% 99.5% / 0.94)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid hsl(240 8% 90%)",
          boxShadow: "0 -4px 12px hsl(240 10% 20% / 0.05)",
        }}
      >

        <div className="flex items-center justify-around py-2 px-4">
          {navigationItems
            .filter((_, i) => i <= 4)
            .map((item) => {
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
                      style={{ background: "hsl(var(--primary) / 0.10)" }}
                    />
                  )}
                  {item.badge && (
                    <span
                      className="absolute top-1.5 right-2 h-2 w-2 rounded-full ring-2 ring-white z-20"
                      style={{ background: "hsl(0 75% 58%)" }}
                    />
                  )}
                  <item.icon
                    size={20}
                    className="relative z-10"
                    color={
                      active
                        ? "hsl(var(--primary))"
                        : "hsl(270 14% 45%)"
                    }
                    strokeWidth={active ? 2.1 : 1.8}
                  />
                  <span
                    className="relative z-10 truncate max-w-[4rem]"
                    style={{
                      fontSize: 10,
                      fontWeight: active ? 600 : 500,
                      color: active
                        ? "hsl(var(--primary))"
                        : "hsl(270 14% 45%)",
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
