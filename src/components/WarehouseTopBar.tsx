import { Link, useLocation } from "react-router-dom";
import { Calendar, Package, Boxes, Wrench, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Personalplanering", icon: Calendar, path: "/warehouse/calendar", matchPaths: ["/warehouse/calendar"] },
  { name: "Planera packning", icon: Package, path: "/warehouse/packing", matchPaths: ["/warehouse/packing"] },
  { name: "Inventarier", icon: Boxes, path: "/warehouse/inventory", matchPaths: ["/warehouse/inventory"] },
  { name: "Service", icon: Wrench, path: "/warehouse/service", matchPaths: ["/warehouse/service"] },
];

export default function WarehouseTopBar() {
  const location = useLocation();

  const isTabActive = (tab: typeof tabs[0]) => {
    return tab.matchPaths.some(path => location.pathname.startsWith(path));
  };

  return (
    <div className="sticky top-0 z-40 w-full bg-background border-b">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Back to main system */}
        <Link 
          to="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Huvudsystem</span>
        </Link>

        {/* Warehouse title */}
        <div className="absolute left-1/2 -translate-x-1/2 font-semibold text-lg">
          Lager
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab);
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{tab.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
