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

  const handleTimerToggle = async () => {
    if (!id || !booking) return;
    if (currentTimer) {
      const stopTime = new Date();
      const startTimeDate = parseISO(currentTimer.startTime);
      const totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
      const breakDeduction = totalHours > 5 ? 0.5 : 0;
      const hoursWorked = Math.max(0, Number((totalHours - breakDeduction).toFixed(2)));

      stopTimer(id);

      try {
        await mobileApi.createTimeReport({
          booking_id: id,
          report_date: format(new Date(), 'yyyy-MM-dd'),
          start_time: format(startTimeDate, 'HH:mm'),
          end_time: format(stopTime, 'HH:mm'),
          hours_worked: hoursWorked,
          break_time: breakDeduction,
          description: `Timer: ${booking.client}`,
        });
        toast.success(`Tidrapport sparad: ${hoursWorked}h`);
      } catch (err: any) {
        toast.error(err.message || 'Kunde inte spara tidrapport');
      }
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Jobb hittades inte</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card">
      {/* Header */}
      <div className="bg-primary px-4 pt-12 pb-4 safe-area-top">
        <div className="flex items-center gap-3 mb-3">
          <button 
            onClick={() => navigate('/m')} 
            className="p-2 rounded-xl bg-primary-foreground/10 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-primary-foreground truncate tracking-tight">{booking.client}</h1>
            {booking.booking_number && (
              <p className="text-[11px] text-primary-foreground/50 font-mono">#{booking.booking_number}</p>
            )}
          </div>
        </div>

        {/* Timer button */}
        <div className="flex items-center gap-2.5">
          <Button
            onClick={handleTimerToggle}
            className={cn(
              "flex-1 h-11 rounded-xl gap-2 text-sm font-bold transition-all active:scale-[0.98]",
              currentTimer
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            )}
          >
            {currentTimer ? (
              <><Square className="w-4 h-4" /> Stoppa {formatTimer(timerElapsed)}</>
            ) : (
              <><Play className="w-4 h-4" /> Starta timer</>
            )}
          </Button>
          
          {(booking.delivery_latitude || booking.deliveryaddress) && (
            <Button
              onClick={openNavigation}
              variant="outline"
              className="h-11 w-11 shrink-0 rounded-xl border-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/10 bg-primary-foreground/5 p-0"
            >
              <Navigation className="w-4.5 h-4.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Address card */}
      {booking.deliveryaddress && (
        <div className="mx-4 -mt-2 mb-1 p-3 rounded-xl bg-card border border-border/50 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-foreground font-medium text-sm">{booking.deliveryaddress}</span>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="px-4 pt-2.5">
        <div className="flex gap-0.5 bg-muted/50 rounded-xl p-0.5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all duration-200",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-3">
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
