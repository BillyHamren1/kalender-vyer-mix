
import { Link, useLocation } from "react-router-dom";
import { Grid2X2, Calendar, ClipboardList, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const Index = () => {
  const location = useLocation();

  const tabs = [
    { name: "Kalender", icon: Calendar, path: "/calendar" },
    { name: "Bokningar", icon: ClipboardList, path: "/booking-list" },
    { name: "Personal", icon: Users, path: "/staff-management" },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header with Logo */}
      <div className="bg-white border-b border-border px-6 py-4">
        <div className="flex items-center space-x-3">
          <Grid2X2 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">EventFlow</h1>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-border">
        <div className="px-6 py-3">
          <nav className="flex items-center gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname === tab.path || 
                (location.pathname === "/" && tab.path === "/calendar");
              
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

      {/* Welcome Content */}
      <div className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Välkommen till EventFlow
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Ditt kompletta system för personalplanering och eventhantering.
            Välj en flik ovan för att komma igång.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Index;
