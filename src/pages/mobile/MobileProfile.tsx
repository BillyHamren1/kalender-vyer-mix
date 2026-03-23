import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useNavigate } from 'react-router-dom';
import { getGpsSettings } from '@/hooks/useGeofencing';
import { useMobileTimeReports, useMobileTravelLogs } from '@/hooks/useMobileData';
import { useTravelDetection } from '@/hooks/useTravelDetection';
import { User, Mail, Phone, MapPin, LogOut, Radar, Shield, Clock, ChevronRight, MessageSquare, Car } from 'lucide-react';
import { MobileProfileHeader } from '@/components/mobile-app/MobileHeader';
import { Button } from '@/components/ui/button';
import SendMessageDialog from '@/components/mobile-app/SendMessageDialog';
import TravelBanner from '@/components/mobile-app/TravelBanner';
import { format, parseISO } from 'date-fns';
import { formatHoursMinutes } from '@/utils/formatHours';
import { sv } from 'date-fns/locale';


const MobileProfile = () => {
  const { staff, logout } = useMobileAuth();
  const navigate = useNavigate();
  const gps = getGpsSettings();
  const { data: timeReports = [], isLoading: isLoadingReports } = useMobileTimeReports();
  const { data: travelLogs = [], isLoading: isLoadingTravel } = useMobileTravelLogs();
  const { travelState, elapsedSeconds, manualStopTravel } = useTravelDetection();

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
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Kontaktinfo</h2>
          
          {staff.email && (
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/8">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">E-post</p>
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
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Telefon</p>
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
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Avdelning</p>
                <p className="text-sm font-semibold text-foreground">{staff.department}</p>
              </div>
            </div>
          )}
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
            <p className="text-sm font-semibold text-foreground">Tidrapporter</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isLoadingReports ? 'Laddar...' : `${timeReports.length} st · ${formatHoursMinutes(totalHours)} totalt`}
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
              <p className="text-sm font-semibold text-foreground">Under förflyttning</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isLoadingTravel ? 'Laddar...' : `${travelCount} resor · ${Math.round(totalTravelHours * 10) / 10}h totalt`}
              </p>
            </div>
          </div>

          {/* Recent travel logs */}
          {travelLogs.filter(l => l.end_time).slice(0, 3).map(log => (
            <div key={log.id} className="border-t border-border/50 py-2 first:mt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {format(parseISO(log.report_date), 'd MMM', { locale: sv })}
                </span>
                <span className="text-xs font-bold text-primary tabular-nums">{log.hours_worked}h</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                {log.from_address && <p className="truncate">Från: {log.from_address}</p>}
                {log.to_address && <p className="truncate">Till: {log.to_address}</p>}
              </div>
            </div>
          ))}

          {travelLogs.filter(l => l.end_time).length === 0 && !isLoadingTravel && (
            <p className="text-[11px] text-muted-foreground/60 text-center py-2 border-t border-border/50">
              Inga förflyttningar registrerade
            </p>
          )}
        </div>

        {/* Send message */}
        <SendMessageDialog
          trigger={
            <button className="w-full rounded-2xl border border-primary/20 bg-card px-4 py-3 shadow-md flex items-center gap-3 active:scale-[0.98] transition-all">
              <div className="p-1.5 rounded-lg bg-primary/8">
                <MessageSquare className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-foreground">Skicka meddelande</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Till kontoret</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          }
        />

        {/* GPS Settings */}
        <div className="rounded-2xl border border-primary/20 bg-card px-4 py-3 space-y-2 shadow-md">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">GPS & Geofencing</h2>
          
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/8">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Automatisk tidrapportering</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Starta timer vid arbetsplatsen</p>
            </div>
            <div className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${gps.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {gps.enabled ? 'Aktiv' : 'Av'}
            </div>
          </div>

          <div className="flex items-center gap-2.5 pl-10">
            <Radar className="w-3.5 h-3.5 text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground">Radie</span>
            <span className="text-sm font-semibold text-foreground">{gps.radius} m</span>
          </div>
        </div>

        {/* Version */}
        <div className="rounded-2xl border border-primary/20 bg-card px-4 py-2.5 shadow-md">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Version</span>
            <span className="font-mono text-[11px] text-muted-foreground/60">1.0.0</span>
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full h-11 rounded-2xl text-sm gap-2 font-semibold border-destructive/25 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all active:scale-[0.98]"
          onClick={handleLogout}
        >
          <LogOut className="w-4.5 h-4.5" />
          Logga ut
        </Button>
      </div>
    </div>
  );
};

export default MobileProfile;
