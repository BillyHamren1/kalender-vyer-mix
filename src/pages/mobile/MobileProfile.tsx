import { useState, useEffect } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useNavigate } from 'react-router-dom';
import { getGpsSettings } from '@/hooks/useGeofencing';
import { mobileApi, MobileTimeReport } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { User, Mail, Phone, MapPin, LogOut, Radar, Shield, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const MobileProfile = () => {
  const { staff, logout } = useMobileAuth();
  const navigate = useNavigate();
  const gps = getGpsSettings();

  const [timeReports, setTimeReports] = useState<MobileTimeReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [showAllReports, setShowAllReports] = useState(false);

  useEffect(() => {
    mobileApi.getTimeReports()
      .then(res => setTimeReports(res.time_reports))
      .catch(() => toast.error('Kunde inte ladda rapporter'))
      .finally(() => setIsLoadingReports(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/m/login', { replace: true });
  };

  if (!staff) return null;

  const visibleReports = showAllReports ? timeReports : timeReports.slice(0, 5);
  const totalHours = timeReports.reduce((sum, r) => sum + r.hours_worked, 0);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-5 pt-14 pb-10 safe-area-top overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-primary-foreground/5" />
        
        <div className="relative flex flex-col items-center">
          <div className="w-[72px] h-[72px] rounded-3xl bg-primary-foreground/15 border border-primary-foreground/20 flex items-center justify-center mb-3 backdrop-blur-sm">
            <User className="w-9 h-9 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-extrabold text-primary-foreground tracking-tight">{staff.name}</h1>
          {staff.role && (
            <p className="text-sm text-primary-foreground/60 mt-0.5 font-medium">{staff.role}</p>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 -mt-5">
        {/* Contact info */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Kontaktinfo</h2>
          
          {staff.email && (
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-primary/8">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground font-medium">E-post</p>
                <p className="text-sm font-semibold truncate text-foreground">{staff.email}</p>
              </div>
            </div>
          )}

          {staff.phone && (
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-primary/8">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground font-medium">Telefon</p>
                <p className="text-sm font-semibold text-foreground">{staff.phone}</p>
              </div>
            </div>
          )}

          {staff.department && (
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-primary/8">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground font-medium">Avdelning</p>
                <p className="text-sm font-semibold text-foreground">{staff.department}</p>
              </div>
            </div>
          )}
        </div>

        {/* Time report history */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tidrapporter</h2>
            {!isLoadingReports && timeReports.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{timeReports.length} st</span>
                <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-xs font-bold text-primary">{totalHours}h</span>
              </div>
            )}
          </div>

          {isLoadingReports ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : timeReports.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-7 h-7 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-medium text-foreground/60">Inga rapporter ännu</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleReports.map(report => (
                  <div key={report.id} className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate text-foreground">
                          {report.bookings?.client || 'Okänt jobb'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(report.report_date), 'd MMM yyyy', { locale: sv })}
                          {report.start_time && report.end_time && (
                            <span> · {report.start_time.slice(0, 5)}–{report.end_time.slice(0, 5)}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-sm tabular-nums">{report.hours_worked}h</p>
                        {report.overtime_hours > 0 && (
                          <p className="text-[10px] text-primary font-bold">+{report.overtime_hours}h öt</p>
                        )}
                      </div>
                    </div>
                    {report.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{report.description}</p>
                    )}
                  </div>
                ))}
              </div>

              {timeReports.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAllReports(!showAllReports)}
                >
                  {showAllReports ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      Visa färre
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Visa alla ({timeReports.length})
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </div>

        {/* GPS Settings */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4 shadow-sm">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">GPS & Geofencing</h2>
          
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-primary/8">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Automatisk tidrapportering</p>
              <p className="text-xs text-muted-foreground mt-0.5">Starta timer vid arbetsplatsen</p>
            </div>
            <div className={`px-3 py-1.5 rounded-xl text-xs font-bold ${gps.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {gps.enabled ? 'Aktiv' : 'Av'}
            </div>
          </div>

          <div className="flex items-center gap-3 pl-[52px]">
            <Radar className="w-4 h-4 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Radie</span>
            <span className="text-sm font-semibold text-foreground">{gps.radius} m</span>
          </div>
        </div>

        {/* App info */}
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Version</span>
            <span className="font-mono text-xs text-muted-foreground/70">1.0.0</span>
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full h-[52px] rounded-2xl text-[15px] gap-2.5 font-semibold border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all active:scale-[0.98]"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5" />
          Logga ut
        </Button>
      </div>
    </div>
  );
};

export default MobileProfile;
