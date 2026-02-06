import { useState, useEffect } from 'react';
import { mobileApi, MobileBooking } from '@/services/mobileApiService';
import { useGeofencing, ActiveTimer } from '@/hooks/useGeofencing';
import { format, parseISO, differenceInSeconds } from 'date-fns';
import { Clock, Square, Loader2, Check } from 'lucide-react';
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

  // Form state
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
      // Reset form
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
      <div className="flex flex-col min-h-screen">
        <div className="bg-gradient-to-r from-primary to-primary/80 px-5 pt-12 pb-5 safe-area-top">
          <h1 className="text-xl font-bold text-primary-foreground">Tidrapportering</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 px-5 pt-12 pb-5 safe-area-top">
        <h1 className="text-xl font-bold text-primary-foreground">Tidrapportering</h1>
        <p className="text-xs text-primary-foreground/70">Rapportera arbetstid</p>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Active timers */}
        {activeTimers.size > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-primary">Aktiva timers</h2>
            {Array.from(activeTimers.entries()).map(([bookingId, timer]) => (
              <ActiveTimerCard
                key={bookingId}
                timer={timer}
                onStop={() => {
                  stopTimer(bookingId);
                  setSelectedBookingId(bookingId);
                  toast.info('Timer stoppad – fyll i tidrapporten');
                }}
              />
            ))}
          </div>
        )}

        {/* Report form — always visible */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <h2 className="font-semibold text-sm">Ny tidrapport</h2>

          <div className="space-y-2">
            <Label className="text-xs">Jobb</Label>
            <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
              <SelectTrigger className="h-11 rounded-lg">
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
            <Label className="text-xs">Datum</Label>
            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="h-11 rounded-lg" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Start</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-11 rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Slut</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-11 rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Rast (h)</Label>
              <Input type="number" step="0.25" value={breakTime} onChange={e => setBreakTime(e.target.value)} className="h-11 rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Övertid (h)</Label>
              <Input type="number" step="0.5" value={overtime} onChange={e => setOvertime(e.target.value)} className="h-11 rounded-lg" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Beskrivning</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Vad gjorde du..."
              className="rounded-lg min-h-[80px]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Totalt: </span>
              <span className="font-bold text-foreground">{calculateHours()}h</span>
            </div>
            <Button onClick={handleSubmit} disabled={isSaving} className="rounded-lg gap-1.5">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Spara
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Active timer card sub-component
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
    <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{timer.client}</p>
        <p className="text-xs text-muted-foreground">
          Startad {format(parseISO(timer.startTime), 'HH:mm')}
          {timer.isAutoStarted && ' (auto)'}
        </p>
      </div>
      <div className="font-mono font-bold text-primary text-base tabular-nums">
        {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
      </div>
      <Button size="sm" variant="destructive" className="rounded-lg h-9 gap-1" onClick={onStop}>
        <Square className="w-3.5 h-3.5" />
        Stopp
      </Button>
    </div>
  );
};

export default MobileTimeReport;
