import { Link, useLocation } from "react-router-dom";
import { Calendar, ShoppingCart, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const GlobalTopBar = () => {
  const location = useLocation();

  const tabs = [
    { 
      name: "Personalplanering", 
      icon: Calendar, 
      path: "/calendar",
      matchPaths: ["/calendar", "/custom-calendar"]
    },
    { 
      name: "Projekthantering", 
      icon: ShoppingCart, 
      path: "/booking-list",
      matchPaths: ["/booking-list", "/booking"]
    },
    { 
      name: "Personaladministration", 
      icon: Users, 
      path: "/staff-management",
      matchPaths: ["/staff-management", "/staff"]
    },
    { 
      name: "Inställningar", 
      icon: Settings, 
      path: "/settings",
      matchPaths: ["/settings"]
    },
  ];

  const isTabActive = (tab: typeof tabs[0]) => {
    return tab.matchPaths.some(p => location.pathname.startsWith(p));
  };

  return (
    <div className="bg-white border-b border-border">
      <div className="flex items-center justify-start px-8 py-4">
        <nav className="flex items-center gap-24">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab);
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex items-center gap-3 text-base font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-white px-5 py-2.5 rounded-full"
                    : "text-[#374151] hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
                <span>{tab.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default GlobalTopBar;
