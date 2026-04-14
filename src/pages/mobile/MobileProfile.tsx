import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useNavigate } from 'react-router-dom';
import { getGpsSettings } from '@/hooks/useGeofencing';
import { useMobileTimeReports, useMobileTravelLogs } from '@/hooks/useMobileData';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { User, Mail, Phone, MapPin, LogOut, Radar, Shield, Clock, ChevronRight, MessageSquare, Car, Globe } from 'lucide-react';
import { MobileProfileHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import SendMessageDialog from '@/components/mobile-app/SendMessageDialog';
import TravelBanner from '@/components/mobile-app/TravelBanner';
import { format, parseISO } from 'date-fns';
import { formatHoursMinutes } from '@/utils/formatHours';
import { sv, enUS } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageContext';


const MobileProfile = () => {
  const { staff, logout } = useMobileAuth();
  const navigate = useNavigate();
  const gps = getGpsSettings();
  const { data: timeReports = [], isLoading: isLoadingReports } = useMobileTimeReports();
  const { data: travelLogs = [], isLoading: isLoadingTravel } = useMobileTravelLogs();
  const { travelState, elapsedSeconds, manualStopTravel } = useTravelDetection();
  const { t, locale, setLocale } = useLanguage();

  const dateFnsLocale = locale === 'en' ? enUS : sv;

  const handleLogout = () => {
    logout();
    navigate('/m/login', { replace: true });
  };

  if (!staff) return null;

  const totalHours = timeReports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalTravelHours = travelLogs
    .filter(l => l.end_time)
    .reduce((sum, l) => sum + l.hours_worked, 0);
  const travelCount = travelLogs.filter(l => l.end_time).length;

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileProfileHeader
        name={staff.name}
        role={staff.role}
        avatar={
          <div className="w-16 h-16 rounded-2xl bg-primary-foreground/15 border border-primary-foreground/15 flex items-center justify-center mb-2.5">
            <User className="w-8 h-8 text-primary-foreground" />
          </div>
        }
      />

      <div className="flex-1 px-4 py-3 space-y-2.5 -mt-3">
        {/* Active travel banner */}
        <TravelBanner travelState={travelState} elapsedSeconds={elapsedSeconds} onStop={manualStopTravel} />

        {/* Contact info */}
        <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 space-y-2 shadow-md">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t('profile.contactInfo')}</h2>
          
          {staff.email && (
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/8">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t('profile.email')}</p>
                <p className="text-sm font-semibold truncate text-foreground">{staff.email}</p>
              </div>
            </div>
          )}

          {staff.phone && (
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/8">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t('profile.phone')}</p>
                <p className="text-sm font-semibold text-foreground">{staff.phone}</p>
              </div>
            </div>
          )}

          {staff.department && (
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/8">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t('profile.department')}</p>
                <p className="text-sm font-semibold text-foreground">{staff.department}</p>
              </div>
            </div>
          )}
        </div>

        {/* Language toggle */}
        <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/8">
              <Globe className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{t('profile.language')}</p>
            </div>
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setLocale('sv')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  locale === 'sv' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                SV
              </button>
              <button
                onClick={() => setLocale('en')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  locale === 'en' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {/* Time reports button */}
        <button
          onClick={() => navigate('/m/time-history')}
          className="w-full rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md flex items-center gap-3 active:scale-[0.98] transition-all"
        >
          <div className="p-1.5 rounded-lg bg-primary/8">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-foreground">{t('profile.timeReports')}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isLoadingReports ? t('profile.loading') : `${timeReports.length} ${t('common.st')} · ${formatHoursMinutes(totalHours)} ${t('profile.totalSuffix')}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Travel history */}
        <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/8">
              <Car className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{t('profile.travel')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isLoadingTravel ? t('profile.loading') : `${travelCount} ${t('profile.trips')} · ${Math.round(totalTravelHours * 10) / 10}h ${t('profile.totalSuffix')}`}
              </p>
            </div>
          </div>

          {/* Recent travel logs */}
          {travelLogs.filter(l => l.end_time).slice(0, 3).map(log => (
            <div key={log.id} className="border-t border-border/50 py-2 first:mt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {format(parseISO(log.report_date), 'd MMM', { locale: dateFnsLocale })}
                </span>
                <span className="text-xs font-bold text-primary tabular-nums">{formatHoursMinutes(log.hours_worked)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                {log.from_address && <p className="truncate">{t('profile.from')}: {log.from_address}</p>}
                {log.to_address && <p className="truncate">{t('profile.to')}: {log.to_address}</p>}
              </div>
            </div>
          ))}

          {travelLogs.filter(l => l.end_time).length === 0 && !isLoadingTravel && (
            <p className="text-[11px] text-muted-foreground/60 text-center py-2 border-t border-border/50">
              {t('profile.noTrips')}
            </p>
          )}
        </div>


        {/* Logout */}
        <Button
          variant="outline"
          className="w-full h-11 rounded-2xl text-sm gap-2 font-semibold border-destructive/25 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all active:scale-[0.98]"
          onClick={handleLogout}
        >
          <LogOut className="w-4.5 h-4.5" />
          {t('profile.logout')}
        </Button>
      </div>
    </div>
  );
};

export default MobileProfile;
