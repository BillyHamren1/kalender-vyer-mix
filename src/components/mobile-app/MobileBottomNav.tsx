import { Briefcase, Clock, Receipt, User, ScanLine } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { isNativePlatform, setLastModule } from '@/utils/nativeModule';

const tabs = [
  { path: '/m', label: 'Jobb', icon: Briefcase, exact: true },
  { path: '/m/report', label: 'Tid', icon: Clock },
  { path: '/m/expenses', label: 'Utlägg', icon: Receipt },
  { path: '/m/profile', label: 'Profil', icon: User },
];

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const native = isNativePlatform();

  const isActive = (tab: typeof tabs[0]) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  const switchToScanner = () => {
    setLastModule('scanner');
    navigate('/scanner');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/60 safe-area-bottom">
      <div className="flex items-stretch h-[68px] max-w-lg mx-auto px-2">
        {tabs.map(tab => {
          const active = isActive(tab);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200",
                active
                  ? "text-primary"
                  : "text-muted-foreground/60 active:text-foreground"
              )}
            >
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-primary" />
              )}
              <div className={cn(
                "flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-200",
                active && "bg-primary/10"
              )}>
                <tab.icon className={cn("w-[22px] h-[22px] transition-all", active && "stroke-[2.5]")} />
              </div>
              <span className={cn(
                "text-[10px] leading-none transition-all",
                active ? "font-bold text-primary" : "font-medium"
              )}>
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* Module switcher – only in native app */}
        {native && (
          <button
            onClick={switchToScanner}
            className="relative flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground/60 active:text-foreground transition-all duration-200"
          >
            <div className="flex items-center justify-center w-10 h-8 rounded-xl">
              <ScanLine className="w-[22px] h-[22px]" />
            </div>
            <span className="text-[10px] leading-none font-medium">Scanner</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
