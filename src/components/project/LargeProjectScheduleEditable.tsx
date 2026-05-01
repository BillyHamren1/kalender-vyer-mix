import { useState } from "react";
import { Calendar } from "lucide-react";
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
}

const formatTimeFromISO = (time: string | null | undefined): string => {
  if (!time) return '';
  if (time.includes('T')) return time.substring(11, 16);
  return time.substring(0, 5);
};

/**
 * Compact date format matching design: "25,26,27/5 -26" or "30/5,1/6 -26".
 * Groups by month, joins days with comma, appends /M after each month group,
 * and a single -YY suffix at the end (using the last date's year).
 */
const formatDatesCompact = (dates: string[]): string => {
  if (!dates.length) return '';
  const parsed = [...dates]
    .filter(Boolean)
    .map((d) => {
      const [y, m, day] = d.split('-').map(Number);
      return { y, m, day };
    })
    .sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.day - b.day));

  if (!parsed.length) return '';

  // Group consecutive entries by month/year
  const groups: { y: number; m: number; days: number[] }[] = [];
  for (const p of parsed) {
    const last = groups[groups.length - 1];
    if (last && last.y === p.y && last.m === p.m) {
      last.days.push(p.day);
    } else {
      groups.push({ y: p.y, m: p.m, days: [p.day] });
    }
  }

  const lastYear = parsed[parsed.length - 1].y;
  const yy = String(lastYear).slice(-2);

  const body = groups
    .map((g) => `${g.days.join(',')}/${g.m}`)
    .join(',');

  return `${body} -${yy}`;
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
    { editKey: 'rig', label: 'UPPMONTERING', dates: startDates || [], startTime: startStartTime, endTime: startEndTime },
    { editKey: 'event', label: 'EVENEMANG', dates: eventDates || [], startTime: eventStartTime, endTime: eventEndTime },
    { editKey: 'rigDown', label: 'NEDMONTERING', dates: endDates || [], startTime: endStartTime, endTime: endEndTime },
  ];

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
      <div className="flex items-center gap-3 w-full">
        <div className="flex items-center gap-2 shrink-0 pr-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            DATUM
          </span>
        </div>

        {items.map((item) => {
          const display = formatDatesCompact(item.dates);
          return (
            <button
              key={item.editKey}
              type="button"
              onClick={() => setEditingItem(item)}
              className="flex-1 rounded-lg border border-border/50 bg-card hover:border-primary/40 hover:shadow-sm transition-all px-3 py-2 text-center cursor-pointer"
              title="Klicka för att redigera"
            >
              <div className="text-sm font-semibold text-foreground leading-tight">
                {display || '—'}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
                {item.label}
              </div>
            </button>
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
