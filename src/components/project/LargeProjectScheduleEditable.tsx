import { useState } from "react";
import { format, differenceInDays, isPast, isToday } from "date-fns";
import { sv } from "date-fns/locale";
import { Truck, PartyPopper, ArrowDownToLine, Pencil, Plus } from "lucide-react";
import { EditDateDialog } from "@/components/booking/EditDateDialog";

interface LargeProjectScheduleEditableProps {
  startDates?: string[] | null;
  eventDates?: string[] | null;
  endDates?: string[] | null;
  startStartTime?: string | null;
  startEndTime?: string | null;
  eventStartTime?: string | null;
  eventEndTime?: string | null;
  endStartTime?: string | null;
  endEndTime?: string | null;
  onUpdateScheduleMulti: (dateType: DateType, dates: string[], startTime: string, endTime: string) => void;
}

type DateType = 'rig' | 'event' | 'rigDown';

interface DateItem {
  editKey: DateType;
  label: string;
  dates: string[];
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  icon: typeof Truck;
}

const formatTimeFromISO = (time: string | null | undefined): string => {
  if (!time) return '';
  if (time.includes('T')) return time.substring(11, 16);
  return time.substring(0, 5);
};

const formatDateSpan = (dates: string[]): string => {
  if (dates.length === 0) return '';
  if (dates.length === 1) return format(new Date(dates[0] + 'T00:00:00'), 'd MMM yyyy', { locale: sv });
  const sorted = [...dates].sort();
  const first = new Date(sorted[0] + 'T00:00:00');
  const last = new Date(sorted[sorted.length - 1] + 'T00:00:00');
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${format(first, 'd', { locale: sv })}–${format(last, 'd MMM yyyy', { locale: sv })}`;
  }
  return `${format(first, 'd MMM', { locale: sv })} – ${format(last, 'd MMM yyyy', { locale: sv })}`;
};

const LargeProjectScheduleEditable = ({
  startDates, eventDates, endDates,
  startStartTime, startEndTime,
  eventStartTime, eventEndTime,
  endStartTime, endEndTime,
  onUpdateScheduleMulti,
}: LargeProjectScheduleEditableProps) => {
  const [editingItem, setEditingItem] = useState<DateItem | null>(null);

  const items: DateItem[] = [
    { editKey: 'rig', label: 'RIGG', dates: startDates || [], startTime: startStartTime, endTime: startEndTime, icon: Truck },
    { editKey: 'event', label: 'EVENT', dates: eventDates || [], startTime: eventStartTime, endTime: eventEndTime, icon: PartyPopper },
    { editKey: 'rigDown', label: 'NEDRIVNING', dates: endDates || [], startTime: endStartTime, endTime: endEndTime, icon: ArrowDownToLine },
  ];

  const getCountdownText = (dates: string[]) => {
    if (dates.length === 0) return '';
    const sorted = [...dates].sort();
    const first = new Date(sorted[0] + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    first.setHours(0, 0, 0, 0);
    if (isToday(first)) return 'Idag';
    const days = differenceInDays(first, today);
    if (days < 0) return `${Math.abs(days)} dagar sedan`;
    if (days === 1) return 'Imorgon';
    return `Om ${days} dagar`;
  };

  const handleSaveMulti = (
    savedDates: string[],
    startTime: string,
    endTime: string,
    _eventType: DateType
  ) => {
    if (!editingItem) return;
    onUpdateScheduleMulti(editingItem.editKey, savedDates, startTime, endTime);
    setEditingItem(null);
  };

  return (
    <>
      <div className="flex items-center gap-2 w-full">
        {items.map((item, index) => {
          const hasDates = item.dates.length > 0;
          const firstDate = hasDates ? new Date(item.dates.sort()[0] + 'T00:00:00') : null;
          const past = firstDate ? isPast(firstDate) && !isToday(firstDate) : false;
          const today = firstDate ? isToday(firstDate) : false;
          const Icon = item.icon;
          const startDisplay = formatTimeFromISO(item.startTime);
          const endDisplay = formatTimeFromISO(item.endTime);
          const hasTime = startDisplay || endDisplay;

          return (
            <div key={item.editKey} className="flex items-center flex-1">
              <div
                className={`flex-1 rounded-xl p-3 border transition-all group cursor-pointer hover:border-primary/40 hover:shadow-sm ${
                  today
                    ? 'border-primary/40 bg-accent shadow-sm'
                    : past
                      ? 'border-border/30 bg-muted/50 opacity-70'
                      : hasDates
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

                {hasDates ? (
                  <>
                    <p className="font-semibold text-sm text-foreground tracking-tight">
                      {formatDateSpan(item.dates)}
                    </p>
                    {item.dates.length > 1 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.dates.length} dagar
                      </p>
                    )}
                    {hasTime && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {startDisplay}–{endDisplay}
                      </p>
                    )}
                    <p className={`text-xs mt-0.5 ${today ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      {getCountdownText(item.dates)}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs text-primary font-medium">Lägg till datum</p>
                  </div>
                )}
              </div>
              {index < items.length - 1 && (
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
          date={editingItem.dates[0] || ''}
          dates={editingItem.dates}
          multiSelect
          startTime={formatTimeFromISO(editingItem.startTime)}
          endTime={formatTimeFromISO(editingItem.endTime)}
          eventType={editingItem.editKey}
          onSave={() => {}}
          onSaveMulti={handleSaveMulti}
        />
      )}
    </>
  );
};

export default LargeProjectScheduleEditable;
