import { useState } from "react";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { sv } from "date-fns/locale";
import { Truck, PartyPopper, ArrowDownToLine, Pencil, Plus } from "lucide-react";
import { EditDateDialog } from "@/components/booking/EditDateDialog";

interface LargeProjectScheduleEditableProps {
  startDate?: string | null;
  eventDate?: string | null;
  endDate?: string | null;
  startStartTime?: string | null;
  startEndTime?: string | null;
  eventStartTime?: string | null;
  eventEndTime?: string | null;
  endStartTime?: string | null;
  endEndTime?: string | null;
  onUpdateSchedule: (dateType: DateType, date: string, startTime: string, endTime: string) => void;
}

type DateType = 'rig' | 'event' | 'rigDown';
type InternalKey = 'start' | 'event' | 'end';

interface DateItem {
  key: InternalKey;
  editKey: DateType;
  label: string;
  date: string | null | undefined;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  icon: typeof Truck;
}

const formatTimeFromISO = (time: string | null | undefined): string => {
  if (!time) return '';
  if (time.includes('T')) return time.substring(11, 16);
  return time.substring(0, 5);
};

const LargeProjectScheduleEditable = ({
  startDate, eventDate, endDate,
  startStartTime, startEndTime,
  eventStartTime, eventEndTime,
  endStartTime, endEndTime,
  onUpdateDates,
}: LargeProjectScheduleEditableProps) => {
  const [editingItem, setEditingItem] = useState<DateItem | null>(null);

  const dates: DateItem[] = [
    { key: 'start', editKey: 'rig', label: 'RIGG', date: startDate, startTime: startStartTime, endTime: startEndTime, icon: Truck },
    { key: 'event', editKey: 'event', label: 'EVENT', date: eventDate, startTime: eventStartTime, endTime: eventEndTime, icon: PartyPopper },
    { key: 'end', editKey: 'rigDown', label: 'NEDRIVNING', date: endDate, startTime: endStartTime, endTime: endEndTime, icon: ArrowDownToLine },
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

  const handleSave = (
    _oldDate: string,
    newDate: string,
    _startTime: string,
    _endTime: string,
    _eventType: DateType
  ) => {
    if (!editingItem) return;
    const k = editingItem.key;
    const dateField = k === 'start' ? 'start_date' : k === 'event' ? 'event_date' : 'end_date';

    // Only save the date — times are derived from bookings
    onUpdateDates({
      [dateField]: newDate,
    });
    setEditingItem(null);
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
          const startDisplay = formatTimeFromISO(item.startTime);
          const endDisplay = formatTimeFromISO(item.endTime);
          const hasTime = startDisplay || endDisplay;

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
                onClick={() => setEditingItem(item)}
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
                    {hasTime && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {startDisplay}–{endDisplay}
                      </p>
                    )}
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

      {editingItem && (
        <EditDateDialog
          open={!!editingItem}
          onOpenChange={(open) => { if (!open) setEditingItem(null); }}
          date={editingItem.date || ''}
          startTime={formatTimeFromISO(editingItem.startTime)}
          endTime={formatTimeFromISO(editingItem.endTime)}
          eventType={editingItem.editKey}
          onSave={handleSave}
        />
      )}
    </>
  );
};

export default LargeProjectScheduleEditable;
