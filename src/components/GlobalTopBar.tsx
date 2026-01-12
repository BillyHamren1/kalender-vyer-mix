
import { Link, useLocation } from "react-router-dom";
import { Calendar, ShoppingCart, Users, Grid2X2 } from "lucide-react";
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
  ];

  const isTabActive = (tab: typeof tabs[0]) => {
    return tab.matchPaths.some(p => location.pathname.startsWith(p));
  };

  return (
    <div className="bg-white border-b border-border">
      <div className="flex items-center px-6 py-3 gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mr-4">
          <Grid2X2 className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold text-foreground">EventFlow</span>
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab);
            
            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
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
