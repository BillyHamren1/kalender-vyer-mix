import { Briefcase, Clock, Receipt, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/m', label: 'Jobb', icon: Briefcase, exact: true },
  { path: '/m/report', label: 'Tid', icon: Clock },
  { path: '/m/expenses', label: 'Utlägg', icon: Receipt },
  { path: '/m/profile', label: 'Profil', icon: User },
];

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (tab: typeof tabs[0]) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        {tabs.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <tab.icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
              <span className={cn(
                "text-[10px] font-medium",
                active && "font-bold"
              )}>
                {tab.label}
              </span>
              {active && (
                <div className="absolute top-0 w-8 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
