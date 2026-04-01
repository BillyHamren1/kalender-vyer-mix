import { useState } from "react";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { sv } from "date-fns/locale";
import { Truck, PartyPopper, ArrowDownToLine, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface LargeProjectScheduleEditableProps {
  startDate?: string | null;
  endDate?: string | null;
  onUpdateDates: (updates: { start_date?: string | null; end_date?: string | null }) => void;
}

type DateType = 'start' | 'end';

const dateConfig = {
  start: { label: 'RIGG / START', icon: Truck, dialogTitle: 'Startdatum' },
  end: { label: 'NEDRIVNING / SLUT', icon: ArrowDownToLine, dialogTitle: 'Slutdatum' },
};

const LargeProjectScheduleEditable = ({
  startDate,
  endDate,
  onUpdateDates,
}: LargeProjectScheduleEditableProps) => {
  const [editingType, setEditingType] = useState<DateType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const dates: { key: DateType; label: string; date: string | null | undefined; icon: typeof Truck }[] = [
    { key: 'start', label: dateConfig.start.label, date: startDate, icon: dateConfig.start.icon },
    { key: 'end', label: dateConfig.end.label, date: endDate, icon: dateConfig.end.icon },
  ];

  const getCountdownText = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    if (isToday(date)) return 'Idag';
    const days = differenceInDays(date, today);
    if (days < 0) return `${Math.abs(days)} dagar sedan`;
    if (days === 1) return 'Imorgon';
    return `Om ${days} dagar`;
  };

  const openEdit = (key: DateType, currentDate: string | null | undefined) => {
    setEditingType(key);
    setSelectedDate(currentDate ? new Date(currentDate + 'T00:00:00') : undefined);
  };

  const handleSave = () => {
    if (!editingType || !selectedDate) return;
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (editingType === 'start') {
      onUpdateDates({ start_date: dateStr });
    } else {
      onUpdateDates({ end_date: dateStr });
    }
    setEditingType(null);
  };

  return (
    <>
      <div className="flex items-center gap-2 w-full">
        {dates.map((item, index) => {
          const hasDate = !!item.date;
          const date = hasDate ? new Date(item.date!) : null;
          const past = date ? isPast(date) && !isToday(date) : false;
          const today = date ? isToday(date) : false;
          const Icon = item.icon;

          return (
            <div key={item.key} className="flex items-center flex-1">
              <div
                className={`flex-1 rounded-xl p-3 border transition-all group cursor-pointer hover:border-primary/40 hover:shadow-sm ${
                  today
                    ? 'border-primary/40 bg-accent shadow-sm'
                    : past
                      ? 'border-border/30 bg-muted/50 opacity-70'
                      : hasDate
                        ? 'border-border/40 bg-card'
                        : 'border-dashed border-border/40 bg-muted/30'
                }`}
                onClick={() => openEdit(item.key, item.date)}
                title="Klicka för att redigera"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{
                        background: today ? 'var(--gradient-icon)' : undefined,
                        backgroundColor: today ? undefined : 'hsl(var(--muted))',
                      }}
                    >
                      <Icon className={`h-3 w-3 ${today ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                  <Pencil className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                </div>

                {hasDate ? (
                  <>
                    <p className="font-semibold text-sm text-foreground tracking-tight">
                      {format(date!, 'd MMM yyyy', { locale: sv })}
                    </p>
                    <p className={`text-xs mt-0.5 ${today ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      {getCountdownText(item.date!)}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs text-primary font-medium">Lägg till datum</p>
                  </div>
                )}
              </div>
              {index < dates.length - 1 && (
                <div className="w-6 h-px bg-border/40 flex-shrink-0 mx-1" />
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!editingType} onOpenChange={(open) => { if (!open) setEditingType(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingType ? dateConfig[editingType].dialogTitle : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              initialFocus
              className={cn("rounded-md border pointer-events-auto")}
            />
          </div>
          <DialogFooter className="flex-row gap-1.5 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditingType(null)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!selectedDate}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LargeProjectScheduleEditable;
