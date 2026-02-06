import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useNavigate } from 'react-router-dom';
import { getGpsSettings, setGpsSettings } from '@/hooks/useGeofencing';
import { useState } from 'react';
import { User, Mail, Phone, MapPin, LogOut, Radar, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MobileProfile = () => {
  const { staff, logout } = useMobileAuth();
  const navigate = useNavigate();
  const [gps, setGps] = useState(getGpsSettings);

  const handleGpsToggle = (enabled: boolean) => {
    const updated = { ...gps, enabled };
    setGps(updated);
    setGpsSettings(updated);
  };

  const handleRadiusChange = (value: string) => {
    const radius = Math.max(50, Math.min(500, parseInt(value) || 150));
    const updated = { ...gps, radius };
    setGps(updated);
    setGpsSettings(updated);
  };

  const handleLogout = () => {
    logout();
    navigate('/m/login', { replace: true });
  };

  if (!staff) return null;

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

        {/* GPS Settings */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">GPS & Geofencing</h2>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Automatisk tidrapportering</p>
                <p className="text-xs text-muted-foreground">Starta timer vid arbetsplatsen</p>
              </div>
            </div>
            <Switch checked={gps.enabled} onCheckedChange={handleGpsToggle} />
          </div>

          {gps.enabled && (
            <div className="flex items-center gap-3 pl-12">
              <div className="flex items-center gap-2">
                <Radar className="w-4 h-4 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">Radie (m)</Label>
              </div>
              <Input
                type="number"
                value={gps.radius}
                onChange={e => handleRadiusChange(e.target.value)}
                className="h-8 w-20 rounded-lg text-sm"
                min={50}
                max={500}
              />
            </div>
          )}
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
