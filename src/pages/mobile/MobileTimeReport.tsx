import { useState, useEffect } from 'react';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { useGeofencing, ActiveTimer } from '@/hooks/useGeofencing';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Clock, Square, Loader2, Check, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const MobileTimeReport = () => {
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('16:00');
  const [breakTime, setBreakTime] = useState('0.5');
  const [overtime, setOvertime] = useState('0');
  const [description, setDescription] = useState('');

  const { activeTimers, stopTimer } = useGeofencing(bookings);

  useEffect(() => {
    mobileApi.getBookings()
      .then(res => setBookings(res.bookings))
      .catch(() => toast.error('Kunde inte ladda jobb'))
      .finally(() => setIsLoading(false));
  }, []);

  const calculateHours = () => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const total = (eh + em / 60) - (sh + sm / 60) - parseFloat(breakTime || '0');
    return Math.max(0, Math.round(total * 100) / 100);
  };

  const handleSubmit = async () => {
    if (!selectedBookingId) {
      toast.error('Välj ett jobb');
      return;
    }

    setIsSaving(true);
    try {
      await mobileApi.createTimeReport({
        booking_id: selectedBookingId,
        report_date: reportDate,
        start_time: startTime,
        end_time: endTime,
        hours_worked: calculateHours(),
        overtime_hours: parseFloat(overtime || '0'),
        break_time: parseFloat(breakTime || '0'),
        description: description || undefined,
      });
      toast.success('Tidrapport skapad!');
      setSelectedBookingId('');
      setDescription('');
      setStartTime('07:00');
      setEndTime('16:00');
      setBreakTime('0.5');
      setOvertime('0');
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte skapa tidrapport');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-card">
        <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-5 pt-14 pb-6 safe-area-top overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-foreground/5" />
          <h1 className="relative text-2xl font-extrabold text-primary-foreground tracking-tight">Tidrapportering</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-card">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-primary via-primary to-primary/85 px-5 pt-14 pb-6 safe-area-top overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary-foreground/5" />
        <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-primary-foreground/5" />
        <h1 className="relative text-2xl font-extrabold text-primary-foreground tracking-tight">Tidrapportering</h1>
        <p className="relative text-sm text-primary-foreground/60 font-medium mt-0.5">Rapportera arbetstid</p>
      </div>

      <div className="flex-1 px-4 py-5 space-y-4">
        {/* Active timers */}
        {activeTimers.size > 0 && (
          <div className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Aktiva timers</h2>
            {Array.from(activeTimers.entries()).map(([bookingId, timer]) => (
              <ActiveTimerCard
                key={bookingId}
                timer={timer}
                onStop={async () => {
                  const stopTime = new Date();
                  const startTimeDate = parseISO(timer.startTime);
                  const totalHours = (stopTime.getTime() - startTimeDate.getTime()) / (1000 * 60 * 60);
                  const breakDeduction = totalHours > 5 ? 0.5 : 0;
                  const hoursWorked = Math.max(0, Number((totalHours - breakDeduction).toFixed(2)));

                  stopTimer(bookingId);

                  try {
                    await mobileApi.createTimeReport({
                      booking_id: bookingId,
                      report_date: format(new Date(), 'yyyy-MM-dd'),
                      start_time: format(startTimeDate, 'HH:mm'),
                      end_time: format(stopTime, 'HH:mm'),
                      hours_worked: hoursWorked,
                      break_time: breakDeduction,
                      description: `Timer: ${timer.client}`,
                    });
                    toast.success(`Tidrapport sparad: ${hoursWorked}h`);
                  } catch (err: any) {
                    toast.error(err.message || 'Kunde inte spara tidrapport');
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* Report form */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5 shadow-sm">
          <h2 className="font-bold text-base text-foreground">Ny tidrapport</h2>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Jobb</Label>
            <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Välj jobb..." />
              </SelectTrigger>
              <SelectContent>
                {bookings.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.client} {b.booking_number ? `#${b.booking_number}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Datum</Label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="h-12 rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Start</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Slut</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Rast (h)</Label>
              <Input type="number" step="0.25" value={breakTime} onChange={e => setBreakTime(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Övertid (h)</Label>
              <Input type="number" step="0.5" value={overtime} onChange={e => setOvertime(e.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Beskrivning</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Vad gjorde du..."
              className="rounded-xl min-h-[80px]"
            />
          </div>

          {/* Summary & submit */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm text-muted-foreground">Totalt:</span>
              <span className="text-xl font-extrabold text-foreground tabular-nums">{calculateHours()}h</span>
            </div>
            <Button 
              onClick={handleSubmit} 
              disabled={isSaving} 
              className="rounded-xl gap-2 h-11 px-6 font-semibold shadow-md active:scale-[0.98] transition-all"
              style={{ boxShadow: '0 4px 16px hsl(184 60% 38% / 0.2)' }}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Spara
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ActiveTimerCard = ({ timer, onStop }: { timer: ActiveTimer; onStop: () => void }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(differenceInSeconds(new Date(), parseISO(timer.startTime)));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer.startTime]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-primary/20 bg-primary/5 shadow-sm">
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate text-foreground">{timer.client}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Startad {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
        </p>
      </div>
      <div className="font-mono font-extrabold text-primary text-lg tabular-nums">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button size="sm" variant="destructive" className="rounded-xl h-10 gap-1.5 font-semibold" onClick={onStop}>
        <Square className="w-3.5 h-3.5" />
        Stopp
      </Button>
    </div>
  );
};

export default MobileTimeReport;
