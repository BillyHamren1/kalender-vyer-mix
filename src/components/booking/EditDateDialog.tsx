import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface EditDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  startTime?: string;
  endTime?: string;
  eventType: 'rig' | 'event' | 'rigDown';
  onSave: (
    oldDate: string,
    newDate: string,
    startTime: string,
    endTime: string,
    eventType: 'rig' | 'event' | 'rigDown'
  ) => void;
  // Multi-select support
  multiSelect?: boolean;
  dates?: string[];
  onSaveMulti?: (
    dates: string[],
    startTime: string,
    endTime: string,
    eventType: 'rig' | 'event' | 'rigDown'
  ) => void;
}

const eventTypeLabels: Record<string, string> = {
  rig: 'Riggdag',
  event: 'Eventdag',
  rigDown: 'Rivdag',
};

const toDateObj = (s: string) => new Date(s + 'T00:00:00');
const toDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const EditDateDialog: React.FC<EditDateDialogProps> = ({
  open,
  onOpenChange,
  date,
  startTime = '',
  endTime = '',
  eventType,
  onSave,
  multiSelect = false,
  dates = [],
  onSaveMulti,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (open) {
      if (multiSelect) {
        setSelectedDates(dates.filter(Boolean).map(toDateObj));
      } else {
        setSelectedDate(date ? toDateObj(date) : undefined);
      }
      setStart(startTime || '');
      setEnd(endTime || '');
    }
  }, [open, date, startTime, endTime, multiSelect, dates]);

  const handleSave = () => {
    if (multiSelect) {
      if (selectedDates.length === 0) return;
      const sortedStrs = selectedDates.map(toDateStr).sort();
      onSaveMulti?.(sortedStrs, start, end, eventType);
    } else {
      if (!selectedDate) return;
      onSave(date, toDateStr(selectedDate), start, end, eventType);
    }
    onOpenChange(false);
  };

  const canSave = multiSelect ? selectedDates.length > 0 : !!selectedDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Redigera {eventTypeLabels[eventType]}
            {multiSelect && ' (flera dagar)'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            {multiSelect ? (
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(days) => setSelectedDates(days || [])}
                className="rounded-md border pointer-events-auto"
              />
            ) : (
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
                className="rounded-md border pointer-events-auto"
              />
            )}
          </div>

          {multiSelect && selectedDates.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Valda dagar ({selectedDates.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {selectedDates
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((d) => (
                    <span
                      key={d.toISOString()}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent text-xs font-medium"
                    >
                      {format(d, 'd MMM', { locale: sv })}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDates((prev) =>
                            prev.filter((p) => toDateStr(p) !== toDateStr(d))
                          )
                        }
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tid</label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-[120px]"
                placeholder="Start"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-[120px]"
                placeholder="Slut"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row gap-1.5 justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
