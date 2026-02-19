import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { type LucideIcon,
  Calendar,
  Users,
  FolderKanban,
  ChevronDown,
  PieChart,
  LayoutDashboard,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  children?: { title: string; url: string }[];
}


const navigationItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Personalplanering", url: "/calendar", icon: Calendar },
  {
    title: "Projekt",
    url: "/projects",
    icon: FolderKanban,
    children: [{ title: "Mina projekt", url: "/my-projects" }],
  },
  {
    title: "Ekonomiöversikt",
    url: "/economy",
    icon: PieChart,
    children: [
      { title: "Projekt", url: "/economy/projects" },
      { title: "Personal", url: "/economy/staff" },
      { title: "Personalekonomi", url: "/economy/staff-revenue" },
      { title: "Rapporterad tid / Utlägg", url: "/economy/time-reports" },
    ],
  },
  {
    title: "Logistikplanering",
    url: "/logistics/routes",
    icon: Truck,
    children: [
      { title: "Transportbokning", url: "/logistics/planning" },
      { title: "Ruttplanering", url: "/logistics/routes" },
      { title: "Fordon", url: "/logistics/vehicles" },
    ],
  },
  { title: "Personal", url: "/staff-management", icon: Users },
];

export function Sidebar3D() {
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

        {/* Content */}
        <div className="flex flex-col h-full px-3 py-4">

          {/* ── Nav ── */}
          <nav className="flex-1 space-y-px">
            {navigationItems.map((item) => {
              const hasChildren = !!item.children?.length;
              const active = isItemActive(item);
              const expanded = expandedItems.includes(item.url);
              const hovered = hoveredUrl === item.url;

              const itemStyle: React.CSSProperties = {
                borderLeft: active
                  ? "2.5px solid hsl(184 55% 38%)"
                  : "2px solid transparent",
                paddingTop: 9,
                paddingBottom: 9,
                paddingLeft: active ? 9 : 11,
                paddingRight: 12,
                borderRadius: "0.375rem",
                background: active
                  ? "hsl(200 14% 93%)"
                  : hovered
                  ? "hsl(200 14% 50% / 0.08)"
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

              const iconStyle: React.CSSProperties = {
                color: active
                  ? "hsl(184 60% 38%)"
                  : "hsl(var(--foreground) / 0.60)",
                flexShrink: 0,
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
                    color={active ? "hsl(184 60% 38%)" : "hsl(var(--foreground) / 0.60)"}
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
                      {/* Collapsed tooltip */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-popover text-popover-foreground text-sm font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 shadow-lg border border-border whitespace-nowrap z-50">
                          {item.title}
                        </div>
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
                      {/* Collapsed tooltip */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-popover text-popover-foreground text-sm font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 shadow-lg border border-border whitespace-nowrap z-50">
                          {item.title}
                        </div>
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
                                ? "hsl(184 60% 38%)"
                                : "hsl(var(--foreground) / 0.65)",
                              background: childActive
                                ? "hsl(200 14% 93%)"
                                : childHovered
                                ? "hsl(200 14% 50% / 0.08)"
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
                style={{ background: "hsl(184 55% 38% / 0.12)" }}
              >
                <Users size={14} style={{ color: "hsl(184 60% 38%)" }} />
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
                  EventFlow v1.0
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
                    style={{ background: "hsl(184 60% 38% / 0.08)" }}
                  />
                )}
                <item.icon
                  size={20}
                  className="relative z-10"
                  color={active ? "hsl(184 60% 38%)" : "hsl(var(--muted-foreground))"}
                />

                <span
                  className="relative z-10 truncate max-w-[4rem] font-medium"
                  style={{
                    fontSize: 10,
                    color: active
                      ? "hsl(184 60% 38%)"
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
