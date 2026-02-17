import { useState, useEffect } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useNavigate } from 'react-router-dom';
import { getGpsSettings } from '@/hooks/useGeofencing';
import { mobileApi, MobileTimeReport } from '@/services/mobileApiService';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { User, Mail, Phone, MapPin, LogOut, Radar, Shield, Clock, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const MobileProfile = () => {
  const { staff, logout } = useMobileAuth();
  const navigate = useNavigate();
  const gps = getGpsSettings();

  const [timeReports, setTimeReports] = useState<MobileTimeReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);

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

  const totalHours = timeReports.reduce((sum, r) => sum + r.hours_worked, 0);

  return (
    <div className="flex flex-col min-h-screen bg-card">
      {/* Header */}
      <div className="bg-primary px-5 pt-14 pb-8 safe-area-top rounded-b-3xl shadow-md">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-foreground/15 border border-primary-foreground/15 flex items-center justify-center mb-2.5">
            <User className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight">{staff.name}</h1>
          {staff.role && (
            <p className="text-xs text-primary-foreground/60 mt-0.5 font-medium">{staff.role}</p>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-2.5 -mt-3">
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
              {isLoadingReports ? 'Laddar...' : `${timeReports.length} st · ${totalHours}h totalt`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

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
      </div>

      {/* Logout pinned to bottom */}
      <div className="px-4 pb-6 pt-2 mt-auto">
        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl text-sm gap-2 font-semibold border-destructive/25 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all active:scale-[0.98]"
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
