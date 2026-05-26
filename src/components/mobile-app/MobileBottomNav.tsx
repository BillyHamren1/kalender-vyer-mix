import { Briefcase, Clock, Wrench, MessageCircle, LayoutDashboard } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useUnreadMessageCount } from '@/hooks/useUnreadMessageCount';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMobileRoles } from '@/hooks/mobile/useMobileRoles';
import { mobileApi, getToken } from '@/services/mobileApiService';
import type { TranslationKey } from '@/i18n/translations';

type Tab = { path: string; labelKey: TranslationKey; icon: typeof Briefcase; exact?: boolean; showBadge?: boolean };

const baseTabs: Tab[] = [
  { path: '/m', labelKey: 'nav.jobs', icon: Briefcase, exact: true },
  { path: '/m/report', labelKey: 'nav.time', icon: Clock },
  { path: '/m/inbox', labelKey: 'nav.messages', icon: MessageCircle, showBadge: true },
  { path: '/m/tools', labelKey: 'nav.tools', icon: Wrench },
];

const overviewTab: Tab = { path: '/m/overview', labelKey: 'nav.overview', icon: LayoutDashboard };

const MobileBottomNav = () => {
  const location = useLocation();
  if (location.pathname.includes('/complete')) return null;
  const navigate = useNavigate();
  const { count: unreadCount } = useUnreadMessageCount();
  const { t } = useLanguage();
  const { isPlanner } = useMobileRoles();
  const qc = useQueryClient();

  const tabs: Tab[] = isPlanner
    ? [baseTabs[0], baseTabs[1], overviewTab, baseTabs[2], baseTabs[3]]
    : baseTabs;

  const isActive = (tab: Tab) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  // Prefetch Overview-data för planners så att klick på tabben känns instant.
  const prefetchOverview = () => {
    if (!isPlanner || !getToken()) return;
    const today = startOfDay(new Date());
    const todayStr = format(today, 'yyyy-MM-dd');
    qc.prefetchQuery({
      queryKey: ['mobile-ops-overview', todayStr, todayStr, 'day'],
      queryFn: () => mobileApi.getOpsOverview({ from: todayStr, to: todayStr, mode: 'day', include_anomalies: true }),
      staleTime: 3 * 60_000,
    });
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/85 backdrop-blur-xl border-t border-border/40"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -1px 0 hsl(var(--border) / 0.4), 0 -8px 24px hsl(184 30% 15% / 0.04)',
      }}
    >
      <div className="flex items-stretch h-[64px] max-w-lg mx-auto px-2">
        {tabs.map(tab => {
          const active = isActive(tab);
          const badge = tab.showBadge && unreadCount > 0 && !active;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              onPointerEnter={tab.path === '/m/overview' ? prefetchOverview : undefined}
              onTouchStart={tab.path === '/m/overview' ? prefetchOverview : undefined}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 outline-none focus:outline-none focus-visible:outline-none",
                active ? "text-primary" : "text-muted-foreground/70 active:text-foreground"
              )}
            >
              <div className={cn(
                "relative flex items-center justify-center w-12 h-8 rounded-full transition-all duration-200",
                active && "bg-primary/10"
              )}>
                <tab.icon
                  className={cn(
                    "w-[22px] h-[22px] transition-all",
                    active ? "stroke-[2.25]" : "stroke-[1.75]"
                  )}
                />
                {badge && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-card">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[10px] leading-none tracking-tight transition-all",
                active ? "font-semibold text-primary" : "font-medium"
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
