import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
      { title: "Projekthantering", url: "/projects" },
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
    title: "Personaladmin", 
    url: "/staff-management", 
    icon: Users,
    children: [
      { title: "Personal", url: "/staff-management" },
      { title: "Tidgodkännanden", url: "/staff-management/time-approvals" },
    ]
  },
];

export function Sidebar3D() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
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
          "relative z-40 h-screen shrink-0 transition-all duration-300 ease-out",
          "hidden md:flex flex-col",
          isCollapsed ? "w-20" : "w-56"
        )}
        style={{
          perspective: "1000px",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Background Layer */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-sidebar via-sidebar to-sidebar/95"
          style={{
            transform: "translateZ(-10px)",
            boxShadow: "10px 0 40px rgba(0,0,0,0.15)",
          }}
        />

        {/* Glassmorphism Overlay */}
        <div
          className="absolute inset-0 backdrop-blur-xl"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
            borderRight: "1px solid rgba(255,255,255,0.1)",
          }}
        />

        {/* Content Container */}
        <div className="relative z-10 flex flex-col h-full p-4">
          {/* Logo Section */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div
                className="relative w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg"
                style={{
                  transform: "perspective(100px) rotateY(-5deg)",
                  boxShadow: "0 4px 20px hsl(var(--primary) / 0.4)",
                }}
              >
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>

              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="font-bold text-lg text-foreground tracking-tight">
                    EventFlow
                  </span>
                  <span className="text-xs text-primary -mt-1">
                    planering
                  </span>
                </div>
              )}
            </div>
            
            {/* Collapse Button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(
                "p-2 rounded-xl transition-all duration-300 hover:bg-accent/50",
                "text-muted-foreground hover:text-foreground",
                "hover:shadow-md active:scale-95",
                isCollapsed && "absolute -right-3 top-7 bg-sidebar shadow-lg border border-border/50"
              )}
              style={{ transform: isCollapsed ? "perspective(300px) rotateY(10deg)" : undefined }}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-1">
            {navigationItems.map((item, index) => {
              const hasChildren = item.children && item.children.length > 0;
              const isParentActive = hasChildren 
                ? item.children!.some(child => location.pathname === child.url)
                : location.pathname === item.url || location.pathname.startsWith(item.url + '/');
              const isExpanded = expandedItems.includes(item.url);
              
              return (
                <div key={item.url}>
                  {hasChildren ? (
                    <button
                      onClick={() => toggleExpanded(item.url)}
                      className={cn(
                        "group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300 w-full text-left",
                        "hover:bg-accent/50",
                        isParentActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Hover Effect */}
                      <div
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%)" }}
                      />
                      {/* Icon */}
                      <div
                        className={cn(
                          "relative z-10 p-2 rounded-lg transition-all duration-300",
                          isParentActive ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/50 group-hover:bg-muted"
                        )}
                        style={{
                          transform: isParentActive ? "perspective(100px) rotateY(-5deg)" : undefined,
                          boxShadow: isParentActive ? "0 4px 12px hsl(var(--primary) / 0.3)" : undefined,
                        }}
                      >
                        <item.icon className="w-4 h-4" />
                      </div>
                      {/* Label */}
                      {!isCollapsed && (
                        <>
                          <span className="relative z-10 font-medium text-sm flex-1 whitespace-pre-line leading-tight">
                            {item.title}
                          </span>
                          <ChevronDown 
                            className={cn(
                              "w-4 h-4 transition-transform duration-200 text-muted-foreground",
                              isExpanded && "rotate-180"
                            )} 
                          />
                        </>
                      )}
                      {/* Tooltip (collapsed) */}
                      {isCollapsed && (
                        <div
                          className={cn(
                            "absolute left-full ml-3 px-3 py-2 rounded-lg bg-popover text-popover-foreground text-sm font-medium",
                            "opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200",
                            "shadow-lg border border-border whitespace-nowrap"
                          )}
                          style={{ transform: "perspective(200px) rotateY(-5deg)" }}
                        >
                          {item.title}
                          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-popover border-l border-b border-border rotate-45" />
                        </div>
                      )}
                    </button>
                  ) : (
                    <NavLink
                      to={item.url}
                      className={cn(
                        "group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300",
                        "hover:bg-accent/50",
                        isParentActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                      style={{
                        animationDelay: `${index * 50}ms`,
                        transform: isParentActive ? "translateX(4px)" : undefined,
                      }}
                    >
                      {/* Active Background */}
                      {isParentActive && (
                        <div
                          className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20"
                          style={{ boxShadow: "0 0 20px hsl(var(--primary) / 0.15)" }}
                        />
                      )}
                      {/* Hover Effect */}
                      <div
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%)" }}
                      />
                      {/* Icon */}
                      <div
                        className={cn(
                          "relative z-10 p-2 rounded-lg transition-all duration-300",
                          isParentActive ? "bg-primary text-primary-foreground shadow-md" : "bg-muted/50 group-hover:bg-muted"
                        )}
                        style={{
                          transform: isParentActive ? "perspective(100px) rotateY(-5deg)" : undefined,
                          boxShadow: isParentActive ? "0 4px 12px hsl(var(--primary) / 0.3)" : undefined,
                        }}
                      >
                        <item.icon className="w-4 h-4" />
                      </div>
                      {/* Label */}
                      {!isCollapsed && (
                        <span className="relative z-10 font-medium text-sm flex-1 whitespace-pre-line leading-tight">
                          {item.title}
                        </span>
                      )}
                      {/* Tooltip (collapsed) */}
                      {isCollapsed && (
                        <div
                          className={cn(
                            "absolute left-full ml-3 px-3 py-2 rounded-lg bg-popover text-popover-foreground text-sm font-medium",
                            "opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200",
                            "shadow-lg border border-border whitespace-nowrap"
                          )}
                          style={{ transform: "perspective(200px) rotateY(-5deg)" }}
                        >
                          {item.title}
                          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-popover border-l border-b border-border rotate-45" />
                        </div>
                      )}
                    </NavLink>
                  )}
                  {/* Sub-items */}
                  {hasChildren && !isCollapsed && isExpanded && (
                    <div className="ml-11 mt-1 space-y-1 animate-accordion-down">
                      {item.children!.map((child) => {
                        const isChildActive = location.pathname === child.url;
                        return (
                          <NavLink
                            key={child.url}
                            to={child.url}
                            className={cn(
                              "relative flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-200",
                              "hover:bg-accent/50",
                              isChildActive 
                                ? "text-primary font-medium bg-primary/10" 
                                : "text-muted-foreground hover:text-foreground"
                            )}
                            style={{ transform: isChildActive ? "translateX(4px)" : undefined }}
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
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              {!isCollapsed && (
                <span className="text-sm text-muted-foreground">EventFlow v1.0</span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border">
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
                  "flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all duration-200 relative",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-primary/10 rounded-xl" />
                )}
                <item.icon className={cn("w-5 h-5 relative z-10", isActive && "text-primary")} />
                <span className="text-xs font-medium relative z-10 truncate max-w-[4rem]">{item.title}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
