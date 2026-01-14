import { Link, useLocation } from "react-router-dom";
import { Calendar, Package, Boxes, Wrench, LayoutDashboard, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const WarehouseTopBar = () => {
  const location = useLocation();

  const tabs = [
    { 
      name: "Dashboard", 
      icon: LayoutDashboard, 
      path: "/warehouse",
      matchPaths: ["/warehouse"],
      exact: true
    },
    { 
      name: "Personalplanering", 
      icon: Calendar, 
      path: "/warehouse/calendar",
      matchPaths: ["/warehouse/calendar"]
    },
    { 
      name: "Planera packning", 
      icon: Package, 
      path: "/warehouse/packing",
      matchPaths: ["/warehouse/packing"]
    },
    { 
      name: "Inventarier", 
      icon: Boxes, 
      path: "/warehouse/inventory",
      matchPaths: ["/warehouse/inventory"]
    },
    { 
      name: "Service", 
      icon: Wrench, 
      path: "/warehouse/service",
      matchPaths: ["/warehouse/service"]
    },
  ];

  const isTabActive = (tab: typeof tabs[0]) => {
    if (tab.exact) {
      return location.pathname === tab.path;
    }
    return tab.matchPaths.some(p => location.pathname.startsWith(p));
  };

  return (
    <div className="sticky top-0 z-50 w-full border-b border-border/50 bg-card/95 backdrop-blur shadow-sm">
      <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
        {/* Back to main system */}
        <Link 
          to="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mr-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Huvudsystem</span>
        </Link>

        <nav className="flex flex-1 items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab);
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-all duration-200 rounded-full mx-1",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{tab.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default WarehouseTopBar;
