import { Briefcase, Clock, Receipt, User, MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUnreadMessageCount } from '@/hooks/useUnreadMessageCount';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';

const tabs: { path: string; labelKey: TranslationKey; icon: typeof Briefcase; exact?: boolean; showBadge?: boolean }[] = [
  { path: '/m', labelKey: 'nav.jobs', icon: Briefcase, exact: true },
  { path: '/m/report', labelKey: 'nav.time', icon: Clock },
  { path: '/m/inbox', labelKey: 'nav.messages', icon: MessageCircle, showBadge: true },
  { path: '/m/expenses', labelKey: 'nav.expenses', icon: Receipt },
  { path: '/m/profile', labelKey: 'nav.profile', icon: User },
];

const MobileBottomNav = () => {
  const location = useLocation();
  if (location.pathname.includes('/complete')) return null;
  const navigate = useNavigate();
  const { count: unreadCount } = useUnreadMessageCount();
  const { t } = useLanguage();

  const isActive = (tab: typeof tabs[0]) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/60"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-stretch h-[68px] max-w-lg mx-auto px-2">
        {tabs.map(tab => {
          const active = isActive(tab);
          const badge = tab.showBadge && unreadCount > 0 && !active;
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
                "relative flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-200",
                active && "bg-primary/10"
              )}>
                <tab.icon className={cn("w-[22px] h-[22px] transition-all", active && "stroke-[2.5]")} />
                {badge && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] leading-none transition-all",
                active ? "font-bold text-primary" : "font-medium"
              )}>
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
