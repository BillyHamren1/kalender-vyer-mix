import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { type LucideIcon,
  Calendar,
  LayoutDashboard,
  Package,
  Boxes,
  Wrench,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  exact?: boolean;
  children?: { title: string; url: string }[];
}

const navigationItems: NavItem[] = [
  { title: "Dashboard", url: "/warehouse", icon: LayoutDashboard, exact: true },
  { title: "Personalplanering", url: "/warehouse/calendar", icon: Calendar },
  { title: "Planera packning", url: "/warehouse/packing", icon: Package },
  { title: "Lagerekonomi", url: "/warehouse/economy", icon: TrendingUp },
  { title: "Inventarier", url: "/warehouse/inventory", icon: Boxes },
  { title: "Service", url: "/warehouse/service", icon: Wrench },
];

// Warehouse amber accent colors
const ACCENT = "hsl(38 92% 50%)";        // --warehouse
const ACCENT_BG = "hsl(38 92% 50% / 0.10)"; // active bg
const HOVER_BG = "hsl(38 60% 50% / 0.08)";  // hover bg

export function WarehouseSidebar3D() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

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
    if (item.exact) return location.pathname === item.url;
    if (item.children?.length) {
      return (
        location.pathname === item.url ||
        item.children.some((child) => location.pathname === child.url)
      );
    }
    return (
      location.pathname === item.url ||
      location.pathname.startsWith(item.url + "/")
    );
  };

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside
        className={cn(
          "relative z-40 h-screen shrink-0 transition-all duration-500 ease-out",
          "hidden md:flex flex-col",
          isCollapsed ? "w-14" : "w-48"
        )}
        style={{
          background: "hsl(var(--sidebar-background))",
          borderRight: "1px solid hsl(200 18% 66%)",
        }}
      >
        {/* Collapse toggle — absolute, sticks out on right edge */}
        <button
          onClick={() => setIsCollapsed((v) => !v)}
          className="absolute -right-[9px] top-7 z-20 flex items-center justify-center rounded-sm border"
          style={{
            width: 18,
            height: 18,
            background: "hsl(var(--sidebar-background))",
            borderColor: "hsl(var(--sidebar-border))",
            color: "hsl(var(--foreground) / 0.38)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "hsl(var(--foreground) / 0.70)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "hsl(var(--foreground) / 0.38)")
          }
        >
          {isCollapsed ? (
            <ChevronRight className="w-[11px] h-[11px]" strokeWidth={2} />
          ) : (
            <ChevronLeft className="w-[11px] h-[11px]" strokeWidth={2} />
          )}
        </button>

        {/* Content */}
        <div className="flex flex-col h-full px-3 py-4">
          {/* ── Logo ── */}
          {!isCollapsed && (
            <div className="flex items-center mb-6">
              <span
                className="font-bold leading-none"
                style={{
                  fontSize: 15,
                  letterSpacing: "-0.03em",
                  color: "hsl(var(--foreground))",
                }}
              >
                EventFlow
              </span>
            </div>
          )}

          {/* ── Nav ── */}
          <nav className="flex-1 space-y-px">
            {navigationItems.map((item) => {
              const hasChildren = !!item.children?.length;
              const active = isItemActive(item);
              const expanded = expandedItems.includes(item.url);
              const hovered = hoveredUrl === item.url;

              const itemStyle: React.CSSProperties = {
                borderLeft: active
                  ? `2.5px solid ${ACCENT}`
                  : "2px solid transparent",
                paddingTop: 9,
                paddingBottom: 9,
                paddingLeft: active ? 9 : 11,
                paddingRight: 12,
                borderRadius: "0.375rem",
                background: active
                  ? ACCENT_BG
                  : hovered
                  ? HOVER_BG
                  : "transparent",
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: isCollapsed ? 0 : 8,
                cursor: "pointer",
                transition: "background 150ms",
                justifyContent: isCollapsed ? "center" : "flex-start",
                textAlign: "left",
                boxSizing: "border-box",
              };

              const labelStyle: React.CSSProperties = {
                fontSize: 13,
                lineHeight: 1,
                letterSpacing: "-0.005em",
                fontWeight: active ? 600 : 500,
                color: active
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--foreground) / 0.72)",
                flex: 1,
              };

              const sharedMouseProps = {
                onMouseEnter: () => setHoveredUrl(item.url),
                onMouseLeave: () => setHoveredUrl(null),
              };

              const iconEl = (
                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                  <item.icon
                    size={14}
                    color={active ? ACCENT : "hsl(var(--foreground) / 0.60)"}
                  />
                </div>
              );

              return (
                <div key={item.url}>
                  {hasChildren ? (
                    <button
                      onClick={() => {
                        navigate(item.url);
                        toggleExpanded(item.url);
                      }}
                      style={itemStyle}
                      {...sharedMouseProps}
                    >
                      {iconEl}
                      {!isCollapsed && (
                        <>
                          <span style={labelStyle}>{item.title}</span>
                          <ChevronDown
                            size={14}
                            strokeWidth={2}
                            style={{
                              color: "hsl(var(--foreground) / 0.40)",
                              transition: "transform 200ms",
                              transform: expanded
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                              flexShrink: 0,
                            }}
                          />
                        </>
                      )}
                    </button>
                  ) : (
                    <NavLink
                      to={item.url}
                      style={itemStyle}
                      {...sharedMouseProps}
                    >
                      {iconEl}
                      {!isCollapsed && (
                        <span style={labelStyle}>{item.title}</span>
                      )}
                    </NavLink>
                  )}

                  {/* Sub-items */}
                  {hasChildren && !isCollapsed && expanded && (
                    <div className="ml-7 mt-px space-y-px">
                      {item.children!.map((child) => {
                        const childActive = location.pathname === child.url;
                        const childHovered = hoveredUrl === child.url;
                        return (
                          <NavLink
                            key={child.url}
                            to={child.url}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              paddingTop: 7,
                              paddingBottom: 7,
                              paddingLeft: 10,
                              paddingRight: 10,
                              borderRadius: "0.375rem",
                              fontSize: 12,
                              fontWeight: childActive ? 600 : 500,
                              color: childActive
                                ? ACCENT
                                : "hsl(var(--foreground) / 0.65)",
                              background: childActive
                                ? ACCENT_BG
                                : childHovered
                                ? HOVER_BG
                                : "transparent",
                              transition: "background 150ms",
                            }}
                            onMouseEnter={() => setHoveredUrl(child.url)}
                            onMouseLeave={() => setHoveredUrl(null)}
                          >
                            {child.title}
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* ── Bottom ── */}
          <div
            className="pt-3"
            style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}
          >
            <div
              className={cn(
                "flex items-center gap-2.5 px-2 py-1.5",
                isCollapsed && "justify-center"
              )}
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `${ACCENT_BG}` }}
              >
                <Boxes size={14} style={{ color: ACCENT }} />
              </div>
              {!isCollapsed && (
                <span
                  className="font-medium"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--foreground))",
                    opacity: 0.38,
                  }}
                >
                  Lagersystem v1.0
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
        style={{
          background: "hsl(var(--sidebar-background) / 0.90)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid hsl(var(--border) / 0.50)",
          boxShadow:
            "0 -1px 0 hsl(200 14% 82%), 0 -4px 12px hsl(184 30% 15% / 0.08)",
        }}
      >
        <div className="flex items-center justify-around py-2 px-4">
          {navigationItems.filter((_, i) => i <= 4).map((item) => {
            const active = isItemActive(item);
            const targetUrl = item.children ? item.children[0].url : item.url;

            return (
              <NavLink
                key={item.url}
                to={targetUrl}
                className="relative flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all duration-150"
              >
                {active && (
                  <div
                    className="absolute inset-0 rounded-xl"
                    style={{ background: ACCENT_BG }}
                  />
                )}
                <item.icon
                  size={20}
                  className="relative z-10"
                  color={active ? ACCENT : "hsl(var(--muted-foreground))"}
                />
                <span
                  className="relative z-10 truncate max-w-[4rem] font-medium"
                  style={{
                    fontSize: 10,
                    color: active ? ACCENT : "hsl(var(--muted-foreground))",
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
