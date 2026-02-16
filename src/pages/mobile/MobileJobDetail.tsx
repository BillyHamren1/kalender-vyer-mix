import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { useGeofencing, ActiveTimer } from '@/hooks/useGeofencing';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ArrowLeft, Play, Square, MapPin, Navigation, Phone, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import JobInfoTab from '@/components/mobile-app/job-tabs/JobInfoTab';
import JobTeamTab from '@/components/mobile-app/job-tabs/JobTeamTab';
import JobPhotosTab from '@/components/mobile-app/job-tabs/JobPhotosTab';
import JobCostsTab from '@/components/mobile-app/job-tabs/JobCostsTab';
import JobTimeTab from '@/components/mobile-app/job-tabs/JobTimeTab';

const tabs = ['Info', 'Team', 'Bilder', 'Kostnader', 'Tid'] as const;
type TabKey = typeof tabs[number];

const MobileJobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('Info');
  const [timerElapsed, setTimerElapsed] = useState(0);

  const bookingsArr = booking ? [booking as MobileBooking] : [];
  const { activeTimers, startTimer, stopTimer } = useGeofencing(bookingsArr);
  
  const currentTimer = id ? activeTimers.get(id) : undefined;

  useEffect(() => {
    if (!id) return;
    mobileApi.getBookingDetails(id)
      .then(res => setBooking(res.booking))
      .catch(() => toast.error('Kunde inte ladda jobb'))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    if (!currentTimer) { setTimerElapsed(0); return; }
    const interval = setInterval(() => {
      setTimerElapsed(differenceInSeconds(new Date(), parseISO(currentTimer.startTime)));
    }, 1000);
    return () => clearInterval(interval);
  }, [currentTimer]);

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleTimerToggle = () => {
    if (!id || !booking) return;
    if (currentTimer) {
      stopTimer(id);
      toast.success('Timer stoppad');
      navigate('/m/report');
    } else {
      startTimer(id, booking.client, false);
      toast.success('Timer startad');
    }
  };

  const openNavigation = () => {
    if (!booking) return;
    const { delivery_latitude, delivery_longitude, deliveryaddress } = booking;
    if (delivery_latitude && delivery_longitude) {
      window.open(`https://maps.google.com/maps?daddr=${delivery_latitude},${delivery_longitude}`, '_blank');
    } else if (deliveryaddress) {
      window.open(`https://maps.google.com/maps?daddr=${encodeURIComponent(deliveryaddress)}`, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Jobb hittades inte</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-4 pt-12 pb-5 safe-area-top overflow-hidden">
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-primary-foreground/5" />
        
        <div className="relative flex items-center gap-3 mb-4">
          <button 
            onClick={() => navigate('/m')} 
            className="p-2 rounded-2xl bg-primary-foreground/10 hover:bg-primary-foreground/20 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-primary-foreground truncate tracking-tight">{booking.client}</h1>
            {booking.booking_number && (
              <p className="text-xs text-primary-foreground/60 font-mono">#{booking.booking_number}</p>
            )}
          </div>
        </div>

        {/* Timer button */}
        <div className="relative flex items-center gap-3">
          <Button
            onClick={handleTimerToggle}
            className={cn(
              "flex-1 h-[52px] rounded-2xl gap-2 text-[15px] font-bold shadow-lg transition-all active:scale-[0.98]",
              currentTimer
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            )}
          >
            {currentTimer ? (
              <>
                <Square className="w-5 h-5" />
                Stoppa {formatTimer(timerElapsed)}
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Starta timer
              </>
            )}
          </Button>
          
          {(booking.delivery_latitude || booking.deliveryaddress) && (
            <Button
              onClick={openNavigation}
              variant="outline"
              className="h-[52px] w-[52px] shrink-0 rounded-2xl border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 bg-primary-foreground/5"
            >
              <Navigation className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Address card */}
      {booking.deliveryaddress && (
        <div className="mx-4 -mt-3 mb-2 p-3.5 rounded-2xl bg-card border border-border/60 shadow-md">
          <div className="flex items-center gap-2.5 text-sm">
            <div className="p-1.5 rounded-xl bg-primary/8">
              <MapPin className="w-4 h-4 text-primary" />
            </div>
            <span className="text-foreground font-medium">{booking.deliveryaddress}</span>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="px-4 pt-3">
        <div className="flex gap-1 bg-muted/60 rounded-2xl p-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground/70"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-4">
        {activeTab === 'Info' && <JobInfoTab booking={booking} />}
        {activeTab === 'Team' && <JobTeamTab bookingId={booking.id} />}
        {activeTab === 'Bilder' && <JobPhotosTab bookingId={booking.id} />}
        {activeTab === 'Kostnader' && <JobCostsTab bookingId={booking.id} />}
        {activeTab === 'Tid' && <JobTimeTab bookingId={booking.id} />}
      </div>
    </div>
  );
};

export default MobileJobDetail;
