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
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-5 pt-12 pb-8 safe-area-top">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-primary-foreground/20 flex items-center justify-center mb-3">
            <User className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-primary-foreground">{staff.name}</h1>
          {staff.role && (
            <p className="text-sm text-primary-foreground/70 mt-0.5">{staff.role}</p>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4 -mt-4">
        {/* Contact info */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kontaktinfo</h2>
          
          {staff.email && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">E-post</p>
                <p className="text-sm font-medium truncate">{staff.email}</p>
              </div>
            </div>
          )}

          {staff.phone && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Phone className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Telefon</p>
                <p className="text-sm font-medium">{staff.phone}</p>
              </div>
            </div>
          )}

          {staff.department && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Avdelning</p>
                <p className="text-sm font-medium">{staff.department}</p>
              </div>
            </div>
          )}
        </div>

        {/* Time report history */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tidrapporter</h2>
            {!isLoadingReports && timeReports.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{timeReports.length} st</span>
                <span className="text-xs font-semibold text-primary">{totalHours}h totalt</span>
              </div>
            )}
          </div>

          {isLoadingReports ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : timeReports.length === 0 ? (
            <div className="text-center py-6">
              <Clock className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">Inga rapporter ännu</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleReports.map(report => (
                  <div key={report.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {report.bookings?.client || 'Okänt jobb'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(report.report_date), 'd MMM yyyy', { locale: sv })}
                          {report.start_time && report.end_time && (
                            <span> · {report.start_time.slice(0, 5)}–{report.end_time.slice(0, 5)}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm">{report.hours_worked}h</p>
                        {report.overtime_hours > 0 && (
                          <p className="text-[10px] text-primary font-medium">+{report.overtime_hours}h öt</p>
                        )}
                      </div>
                    </div>
                    {report.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{report.description}</p>
                    )}
                  </div>
                ))}
              </div>

              {timeReports.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs gap-1 text-muted-foreground"
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

        {/* GPS Settings - read-only display */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GPS & Geofencing</h2>
          
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Automatisk tidrapportering</p>
              <p className="text-xs text-muted-foreground">Starta timer vid arbetsplatsen</p>
            </div>
            <div className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {gps.enabled ? 'Aktiv' : 'Inaktiv'}
            </div>
          </div>

          <div className="flex items-center gap-3 pl-12">
            <Radar className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Radie</span>
            <span className="text-sm font-medium">{gps.radius} m</span>
          </div>
        </div>

        {/* App info */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono text-xs text-muted-foreground">1.0.0</span>
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="destructive"
          className="w-full h-12 rounded-xl text-base gap-2"
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
