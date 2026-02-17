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
      <div className="bg-primary px-4 pt-12 pb-4 safe-area-top rounded-b-3xl shadow-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/m')} 
            className="p-2 -ml-1 rounded-xl active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-primary-foreground truncate tracking-tight">{booking.client}</h1>
            {booking.booking_number && (
              <p className="text-[11px] text-primary-foreground/50 font-mono">#{booking.booking_number}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(booking.delivery_latitude || booking.deliveryaddress) && (
              <button
                onClick={openNavigation}
                className="w-10 h-10 rounded-full bg-primary-foreground/15 flex items-center justify-center active:scale-95 transition-all"
              >
                <Navigation className="w-4 h-4 text-primary-foreground" />
              </button>
            )}
            <button
              onClick={handleTimerToggle}
              className={cn(
                "w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all shadow-md relative",
                currentTimer
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "bg-primary-foreground text-primary"
              )}
            >
              {currentTimer ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          </div>
        </div>
        {currentTimer && (
          <div className="mt-2 text-center">
            <span className="text-xs font-mono text-primary-foreground/80 bg-primary-foreground/10 px-3 py-1 rounded-full">
              <Clock className="w-3 h-3 inline mr-1" />{formatTimer(timerElapsed)}
            </span>
          </div>
        )}
      </div>

      {booking.deliveryaddress && (
        <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-card border border-primary">
          <div className="flex items-center gap-2.5 text-sm">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground font-medium">{booking.deliveryaddress}</span>
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
