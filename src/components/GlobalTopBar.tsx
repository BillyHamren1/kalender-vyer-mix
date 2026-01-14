import { Link, useLocation } from "react-router-dom";
import { Calendar, FolderKanban, Users, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

const GlobalTopBar = () => {
  const location = useLocation();

const tabs = [
    { 
      name: "Personalplanering", 
      icon: Calendar, 
      path: "/calendar",
      matchPaths: ["/calendar"]
    },
    { 
      name: "Projekthantering", 
      icon: FolderKanban, 
      path: "/projects",
      matchPaths: ["/projects", "/project"]
    },
    { 
      name: "Personaladministration", 
      icon: Users, 
      path: "/staff-management",
      matchPaths: ["/staff-management", "/staff"]
    },
    { 
      name: "Lagersystem", 
      icon: Warehouse, 
      path: "/warehouse",
      matchPaths: ["/warehouse"]
    },
  ];

  const isTabActive = (tab: typeof tabs[0]) => {
    return tab.matchPaths.some(p => location.pathname.startsWith(p));
  };

  return (
    <div className="sticky top-0 z-50 w-full border-b border-border/50 bg-card/95 backdrop-blur shadow-sm">
      <div className="flex h-16 items-center px-4 sm:px-6 lg:px-8">
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
