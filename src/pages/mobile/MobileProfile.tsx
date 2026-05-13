import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useNavigate } from 'react-router-dom';
import { getGpsSettings } from '@/hooks/useGeofencing';
import { useStaffMonthStatus } from '@/hooks/useStaffMonthStatus';
import { User, Mail, Phone, MapPin, LogOut, Radar, Shield, Clock, ChevronRight, MessageSquare, Car, Globe, AlertTriangle, Sun } from 'lucide-react';
import { MobileProfileHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import SendMessageDialog from '@/components/mobile-app/SendMessageDialog';
import LocationSyncDebugCard from '@/components/mobile-app/LocationSyncDebugCard';
import TimeStartSafetyCard from '@/components/mobile-app/TimeStartSafetyCard';
import ViewAsPicker from '@/components/mobile-app/ViewAsPicker';
import { format, parseISO, startOfMonth } from 'date-fns';
import { formatHoursMinutes } from '@/utils/formatHours';
import { sv, enUS } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageContext';
import { useActiveTimerStatus } from '@/hooks/useActiveTimerStatus';
import { mobileApiService } from '@/services/mobileApiService';
import { useState } from 'react';


const MobileProfile = () => {
  const { staff, logout } = useMobileAuth();
  const navigate = useNavigate();
  const gps = getGpsSettings();
  // Backend snapshot är enda källan för rapporterad tid och resor i profilen.
  // Lokala reduce över time_reports/travel_time_logs är förbjudna här.
  const { status: monthStatus, isLoading: isLoadingMonth } = useStaffMonthStatus(startOfMonth(new Date()));
  const { t, locale, setLocale } = useLanguage();
  const { current: currentWorkday } = useWorkDay();
  const [endDayConfirm, setEndDayConfirm] = useState(false);

  const dateFnsLocale = locale === 'en' ? enUS : sv;

  const workdayOpen = !!currentWorkday && !currentWorkday.ended_at;

  const handleEndDay = () => {
    if (!endDayConfirm) {
      setEndDayConfirm(true);
      window.setTimeout(() => setEndDayConfirm(false), 4000);
      return;
    }
    setEndDayConfirm(false);
    window.dispatchEvent(new CustomEvent('request-end-day'));
  };

  const handleLogout = () => {
    logout();
    navigate('/m/login', { replace: true });
  };

  if (!staff) return null;

  const grossMinutes = monthStatus?.totals.grossWorkdayMinutes ?? 0;
  const transportMinutes = monthStatus?.totals.transportMinutes ?? 0;
  const daysWithWork = monthStatus?.totals.daysWithWork ?? 0;

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
        {/* Admin: Visa som-läge */}
        <ViewAsPicker />

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

        {/* Time reports button — backend-driven sammanfattning av månaden */}
        <button
          onClick={() => navigate('/m/report')}
          className="w-full rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md flex items-center gap-3 active:scale-[0.98] transition-all"
        >
          <div className="p-1.5 rounded-lg bg-primary/8">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-foreground">{t('profile.timeReports')}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isLoadingMonth
                ? t('profile.loading')
                : `${daysWithWork} ${t('profile.trips')} · ${formatHoursMinutes(grossMinutes / 60)} ${t('profile.totalSuffix')}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Travel summary — kanonisk transporttid från månads-snapshot */}
        <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/8">
              <Car className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{t('profile.travel')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isLoadingMonth
                  ? t('profile.loading')
                  : `${formatHoursMinutes(transportMinutes / 60)} ${t('profile.totalSuffix')}`}
              </p>
            </div>
          </div>
        </div>


        {/* Time start safety — internal debug */}
        <TimeStartSafetyCard />

        {/* GPS sync — internal debug */}
        <LocationSyncDebugCard />

        {/* End workday — deliberate two-tap action so users don't conflate it
            with stopping an activity timer. Only visible when a workday is open. */}
        {workdayOpen && (
          <div className="rounded-2xl border border-destructive/30 bg-card p-4 space-y-2 shadow-md">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-destructive/10 shrink-0">
                <Sun className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground">Avsluta arbetsdagen</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Stoppar dagstimern och alla aktiva aktiviteter. Tidrapporter sparas separat när du avslutar varje aktivitet.
                </p>
              </div>
            </div>
            <Button
              variant={endDayConfirm ? 'destructive' : 'outline'}
              className="w-full h-11 rounded-xl text-sm gap-2 font-semibold border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all active:scale-[0.98]"
              onClick={handleEndDay}
            >
              <LogOut className="w-4.5 h-4.5" />
              {endDayConfirm ? 'Tryck igen för att bekräfta' : 'Avsluta dagen'}
            </Button>
          </div>
        )}

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
