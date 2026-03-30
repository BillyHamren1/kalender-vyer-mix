import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';

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
}

const eventTypeLabels: Record<string, string> = {
  rig: 'Riggdag',
  event: 'Eventdag',
  rigDown: 'Rivdag',
};

export const EditDateDialog: React.FC<EditDateDialogProps> = ({
  open,
  onOpenChange,
  date,
  startTime = '',
  endTime = '',
  eventType,
  onSave,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedDate(date ? new Date(date + 'T00:00:00') : undefined);
      setStart(startTime || '');
      setEnd(endTime || '');
    }
  }, [open, date, startTime, endTime]);

  const handleSave = () => {
    if (!selectedDate) return;
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const newDateStr = `${year}-${month}-${day}`;
    onSave(date, newDateStr, start, end, eventType);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Redigera {eventTypeLabels[eventType]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
              className="rounded-md border"
            />
          </div>

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
          <Button size="sm" onClick={handleSave} disabled={!selectedDate}>
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
