import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { 
  Calendar, 
  LayoutDashboard,
  Package,
  Boxes,
  Wrench,
  ChevronLeft,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigationItems = [
  { title: "Dashboard", url: "/warehouse", icon: LayoutDashboard, exact: true },
  { title: "Personalplanering", url: "/warehouse/calendar", icon: Calendar },
  { title: "Planera packning", url: "/warehouse/packing", icon: Package },
  { title: "Lagerekonomi", url: "/warehouse/economy", icon: TrendingUp },
  { title: "Inventarier", url: "/warehouse/inventory", icon: Boxes },
  { title: "Service", url: "/warehouse/service", icon: Wrench },
];

export function WarehouseSidebar3D() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();

  const isItemActive = (item: typeof navigationItems[0]) => {
    if (item.exact) {
      return location.pathname === item.url;
    }
    return location.pathname.startsWith(item.url);
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "relative z-40 h-screen shrink-0 transition-all duration-300 ease-out",
          "hidden md:flex flex-col",
          isCollapsed ? "w-20" : "w-64"
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
                className="relative w-10 h-10 rounded-xl bg-warehouse flex items-center justify-center shadow-lg"
                style={{
                  transform: "perspective(100px) rotateY(-5deg)",
                  boxShadow: "0 4px 20px hsl(var(--warehouse) / 0.4)",
                }}
              >
                <Boxes className="w-5 h-5 text-warehouse-foreground" />
              </div>

              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="font-bold text-lg text-foreground tracking-tight">
                    EventFlow
                  </span>
                  <span className="text-xs text-warehouse -mt-1">
                    lagerplanering
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
          <nav className="flex-1 space-y-2">
            {navigationItems.map((item, index) => {
              const isActive = isItemActive(item);
              
              return (
                <NavLink
                  key={item.url}
                  to={item.url}
                  className={cn(
                    "group relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-300",
                    "hover:bg-accent/50",
                    isActive ? "text-warehouse" : "text-muted-foreground hover:text-foreground"
                  )}
                  style={{
                    animationDelay: `${index * 50}ms`,
                    transform: isActive ? "translateX(4px)" : undefined,
                  }}
                >
                  {/* Active Background */}
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-xl bg-warehouse/10 border border-warehouse/20"
                      style={{
                        boxShadow: "0 0 20px hsl(var(--warehouse) / 0.15)",
                      }}
                    />
                  )}

                  {/* Hover Effect */}
                  <div
                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%)",
                    }}
                  />

                  {/* Icon */}
                  <div
                    className={cn(
                      "relative z-10 p-2 rounded-lg transition-all duration-300",
                      isActive ? "bg-warehouse text-white shadow-md" : "bg-muted/50 group-hover:bg-muted"
                    )}
                    style={{
                      transform: isActive ? "perspective(100px) rotateY(-5deg)" : undefined,
                      boxShadow: isActive ? "0 4px 12px hsl(var(--warehouse) / 0.3)" : undefined,
                    }}
                  >
                    <item.icon className="w-4 h-4" />
                  </div>

                  {/* Label */}
                  {!isCollapsed && (
                    <span className="relative z-10 font-medium text-sm">
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
                      style={{
                        transform: "perspective(200px) rotateY(-5deg)",
                      }}
                    >
                      {item.title}
                      <div
                        className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-popover border-l border-b border-border rotate-45"
                      />
                    </div>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Bottom Section */}
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-warehouse/20 flex items-center justify-center">
                <Boxes className="w-4 h-4 text-warehouse" />
              </div>
              {!isCollapsed && (
                <span className="text-sm text-muted-foreground">Lagersystem v1.0</span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border">
        <div className="flex items-center justify-around py-2 px-4">
          {navigationItems.map((item) => {
            const isActive = isItemActive(item);
            
            return (
              <NavLink
                key={item.url}
                to={item.url}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all duration-200",
                  isActive ? "text-warehouse" : "text-muted-foreground"
                )}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-warehouse/10 rounded-xl" />
                )}
                <item.icon className={cn("w-5 h-5 relative z-10", isActive && "text-warehouse")} />
                <span className="text-xs font-medium relative z-10">{item.title}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
