/**
 * LargeProjectPlannerTaskCard
 * --------------------------------------------------------------------------
 * Presentational kort för ett item i large_project_booking_plan_items.
 * All mutation går via callbacks → useLargeProjectPlannerItems → service.
 * Skriver ALDRIG till calendar_events / staff_assignments / BSA / LPTA.
 */
import { Button } from '@/components/ui/button';
import { Hash, Clock, User, Trash2, GripVertical } from 'lucide-react';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';
import { writeDragPayload, type PlannerDragPayload } from './plannerDnd';

interface Props {
  item: LargeProjectBookingPlanItem;
  booking?: LargeProjectPlannerBooking | null;
  staff?: LargeProjectPlannerStaffMember | null;
  compact?: boolean;
  draggable?: boolean;
  onClick?: (item: LargeProjectBookingPlanItem) => void;
  onDelete?: (item: LargeProjectBookingPlanItem) => void;
}

const STATUS_TONE: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'bg-muted/70 text-muted-foreground border border-border/60',
  planned: 'bg-primary/12 text-primary border border-primary/20',
  in_progress:
    'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
  blocked: 'bg-destructive/15 text-destructive border border-destructive/30',
};

const STATUS_ACCENT: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'bg-muted-foreground/30',
  planned: 'bg-primary/60',
  in_progress: 'bg-amber-500/70',
  done: 'bg-emerald-500/70',
  blocked: 'bg-destructive/70',
};

const STATUS_RING: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'border-dashed border-border/60',
  planned: 'border-border/60',
  in_progress: 'border-amber-500/40 ring-1 ring-amber-500/20',
  done: 'border-emerald-500/40 opacity-75',
  blocked: 'border-destructive/40 ring-1 ring-destructive/20 bg-destructive/5',
};

const STATUS_LABEL: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'Ej planerad',
  planned: 'Planerad',
  in_progress: 'Pågår',
  done: 'Klar',
  blocked: 'Blockerad',
};

const SOURCE_TONE: Record<LargeProjectBookingPlanItem['source'], string> = {
  booking: 'bg-primary/8 text-primary border-primary/20',
  manual: 'bg-muted/60 text-foreground/70 border-border/60',
  split: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25',
};

const SOURCE_LABEL: Record<LargeProjectBookingPlanItem['source'], string> = {
  booking: 'Bokning',
  manual: 'Manuell',
  split: 'Split',
};

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : null);

const LargeProjectPlannerTaskCard = ({
  item,
  booking,
  staff,
  compact,
  draggable,
  onClick,
  onDelete,
}: Props) => {
  const startTime = formatTime(item.start_time);
  const endTime = formatTime(item.end_time);
  const timeLabel = startTime
    ? endTime
      ? `${startTime}–${endTime}`
      : startTime
    : null;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const payload: PlannerDragPayload = {
      itemId: item.id,
      fromDate: item.plan_date,
      fromStaffId: item.assigned_staff_id,
    };
    writeDragPayload(e.dataTransfer, payload);
  };

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onClick={onClick ? () => onClick(item) : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(item);
              }
            }
          : undefined
      }
      className={`group relative overflow-hidden rounded-lg border bg-card pl-2.5 pr-2 py-1.5 text-xs shadow-sm transition-all hover:shadow-md hover:border-primary/40 hover:bg-primary/[0.03] ${
        STATUS_RING[item.status]
      } ${onClick ? 'cursor-pointer' : ''} ${
        draggable ? 'active:cursor-grabbing' : ''
      } ${compact ? 'space-y-1' : 'space-y-1.5'}`}
    >
      {/* Status-accent (vänster kant) */}
      <span
        className={`pointer-events-none absolute left-0 top-0 h-full w-[3px] ${STATUS_ACCENT[item.status]}`}
      />
      {draggable && (
        <GripVertical className="pointer-events-none absolute left-[3px] top-1.5 h-3 w-3 -translate-x-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-60" />
      )}

      <div className="flex items-start justify-between gap-1.5">
        <div
          className={`font-semibold leading-tight text-foreground line-clamp-2 text-[11.5px] ${
            item.status === 'done' ? 'line-through decoration-emerald-500/60' : ''
          }`}
        >
          {item.title}
        </div>
        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 shrink-0 opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            title="Ta bort"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {(booking?.booking_number || timeLabel || staff) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
          {booking?.booking_number && (
            <span className="inline-flex items-center gap-0.5 font-mono tabular-nums font-medium text-foreground/65">
              <Hash className="h-2.5 w-2.5" />
              {booking.booking_number}
            </span>
          )}
          {timeLabel && (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Clock className="h-2.5 w-2.5" />
              {timeLabel}
            </span>
          )}
          {staff && (
            <span className="inline-flex items-center gap-0.5">
              <User className="h-2.5 w-2.5" />
              {staff.name}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_TONE[item.status]}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${SOURCE_TONE[item.source]}`}
        >
          {SOURCE_LABEL[item.source]}
        </span>
        {item.phase && (
          <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
            {item.phase}
          </span>
        )}
      </div>
    </div>
  );
};

export default LargeProjectPlannerTaskCard;
