import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { 
  Calendar, 
  Users, 
  FolderKanban,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  PieChart,
  LayoutDashboard,
  Truck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; url: string }[];
}

const navigationItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Personalplanering", url: "/calendar", icon: Calendar },
  { 
    title: "Projekt", 
    url: "/projects", 
    icon: FolderKanban,
    children: [
      { title: "Mina projekt", url: "/my-projects" },
    ]
  },
  { 
    title: "Ekonomiöversikt", 
    url: "/economy", 
    icon: PieChart,
    children: [
      { title: "Projekt", url: "/economy/projects" },
      { title: "Personal", url: "/economy/staff" },
      { title: "Personalekonomi", url: "/economy/staff-revenue" },
    ]
  },
  { 
    title: "Logistikplanering", 
    url: "/logistics/routes", 
    icon: Truck,
    children: [
      { title: "Transportbokning", url: "/logistics/planning" },
      { title: "Ruttplanering", url: "/logistics/routes" },
      { title: "Fordon", url: "/logistics/vehicles" },
    ]
  },
  { 
    title: "Personal", 
    url: "/staff-management", 
    icon: Users,
  },
];

export function Sidebar3D() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-expand parent if a child route is active
  useEffect(() => {
    navigationItems.forEach(item => {
      if (item.children?.some(child => location.pathname === child.url)) {
        setExpandedItems(prev => prev.includes(item.url) ? prev : [...prev, item.url]);
      }
    });
  }, [location.pathname]);

  const toggleExpanded = (url: string) => {
    setExpandedItems(prev => 
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "relative z-40 h-screen shrink-0 transition-all duration-200 ease-out",
          "hidden md:flex flex-col",
          isCollapsed ? "w-14" : "w-48"
        )}
        style={{
          background: "hsl(var(--sidebar-background))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* Content Container */}
        <div className="flex flex-col h-full px-3 py-4">
          
          {/* Logo Section */}
          <div className={cn(
            "flex items-center mb-6",
            isCollapsed ? "justify-center" : "justify-between"
          )}>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Logo icon */}
              <div
                className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0"
                style={{
                  boxShadow: "0 2px 8px hsl(184 55% 30% / 0.35)",
                }}
              >
                <Sparkles className="w-4 h-4 text-white" />
              </div>

              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span
                    className="font-bold text-[15px] text-foreground leading-none"
                    style={{ letterSpacing: "-0.03em" }}
                  >
                    EventFlow
                  </span>
                  <span
                    className="text-muted-foreground font-semibold uppercase leading-none mt-0.5"
                    style={{ fontSize: "10px", letterSpacing: "0.12em", opacity: 0.55 }}
                  >
                    planering
                  </span>
                </div>
              )}
            </div>

            {/* Collapse Button */}
            {!isCollapsed && (
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Expand Button (collapsed state) */}
          {isCollapsed && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="w-8 h-8 mx-auto mb-4 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150 flex items-center justify-center"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Navigation Items */}
          <nav className="flex-1 space-y-0.5">
            {navigationItems.map((item) => {
              const hasChildren = item.children && item.children.length > 0;
              const isParentActive = hasChildren 
                ? location.pathname === item.url || item.children!.some(child => location.pathname === child.url)
                : location.pathname === item.url || location.pathname.startsWith(item.url + '/');
              const isExpanded = expandedItems.includes(item.url);
              
              return (
                <div key={item.url}>
                  {hasChildren ? (
                    <button
                      onClick={() => { navigate(item.url); toggleExpanded(item.url); }}
                      className={cn(
                        "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150 w-full text-left",
                        isCollapsed && "justify-center",
                        isParentActive
                          ? "bg-accent text-foreground font-semibold"
                          : "text-foreground hover:bg-accent/60"
                      )}
                      style={isParentActive ? {
                        borderLeft: "2.5px solid hsl(var(--primary))",
                      } : { borderLeft: "2.5px solid transparent" }}
                    >
                      {/* Icon */}
                      <item.icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-opacity duration-150",
                          isParentActive ? "text-primary opacity-100" : "text-foreground opacity-60"
                        )}
                      />
                      {/* Label */}
                      {!isCollapsed && (
                        <>
                          <span className={cn(
                            "text-sm flex-1 leading-tight truncate transition-opacity duration-150",
                            isParentActive ? "font-semibold opacity-100" : "font-normal opacity-70"
                          )}>
                            {item.title}
                          </span>
                          <ChevronDown 
                            className={cn(
                              "w-3.5 h-3.5 text-muted-foreground opacity-60 transition-transform duration-200 shrink-0",
                              isExpanded && "rotate-180"
                            )} 
                          />
                        </>
                      )}
                      {/* Tooltip (collapsed) */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-popover text-popover-foreground text-sm font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 shadow-lg border border-border whitespace-nowrap z-50">
                          {item.title}
                        </div>
                      )}
                    </button>
                  ) : (
                    <NavLink
                      to={item.url}
                      className={cn(
                        "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-150",
                        isCollapsed && "justify-center",
                        isParentActive
                          ? "bg-accent text-foreground font-semibold"
                          : "text-foreground hover:bg-accent/60"
                      )}
                      style={isParentActive ? {
                        borderLeft: "2.5px solid hsl(var(--primary))",
                      } : { borderLeft: "2.5px solid transparent" }}
                    >
                      {/* Icon */}
                      <item.icon
                        className={cn(
                          "w-4 h-4 shrink-0 transition-opacity duration-150",
                          isParentActive ? "text-primary opacity-100" : "text-foreground opacity-60"
                        )}
                      />
                      {/* Label */}
                      {!isCollapsed && (
                        <span className={cn(
                          "text-sm flex-1 leading-tight truncate transition-opacity duration-150",
                          isParentActive ? "font-semibold opacity-100" : "font-normal opacity-70"
                        )}>
                          {item.title}
                        </span>
                      )}
                      {/* Tooltip (collapsed) */}
                      {isCollapsed && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-lg bg-popover text-popover-foreground text-sm font-medium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 shadow-lg border border-border whitespace-nowrap z-50">
                          {item.title}
                        </div>
                      )}
                    </NavLink>
                  )}

                  {/* Sub-items */}
                  {hasChildren && !isCollapsed && isExpanded && (
                    <div className="ml-7 mt-0.5 space-y-0.5">
                      {item.children!.map((child) => {
                        const isChildActive = location.pathname === child.url;
                        return (
                          <NavLink
                            key={child.url}
                            to={child.url}
                            className={cn(
                              "flex items-center px-2.5 py-1.5 rounded-md text-sm transition-all duration-150",
                              isChildActive 
                                ? "text-primary font-semibold bg-accent" 
                                : "text-foreground opacity-60 hover:opacity-90 hover:bg-accent/60"
                            )}
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

          {/* Bottom Section */}
          <div className="pt-3 border-t border-border">
            <div className={cn(
              "flex items-center gap-2.5 px-2.5 py-2",
              isCollapsed && "justify-center"
            )}>
              <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5 text-primary" />
              </div>
              {!isCollapsed && (
                <span
                  className="text-muted-foreground font-medium"
                  style={{ fontSize: "11px", opacity: 0.65 }}
                >
                  EventFlow v1.0
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border"
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        <div className="flex items-center justify-around py-2 px-4">
          {navigationItems.filter((_, i) => i <= 4).map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const isActive = hasChildren 
              ? item.children!.some(child => location.pathname === child.url)
              : location.pathname === item.url || location.pathname.startsWith(item.url + '/');
            const targetUrl = hasChildren ? item.children![0].url : item.url;
            
            return (
              <NavLink
                key={item.url}
                to={targetUrl}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-all duration-150",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-accent rounded-lg" />
                )}
                <item.icon className={cn("w-5 h-5 relative z-10", isActive ? "opacity-100" : "opacity-60")} />
                <span className="text-xs font-medium relative z-10 truncate max-w-[4rem]">{item.title}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
