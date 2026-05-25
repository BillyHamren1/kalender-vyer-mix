/**
 * LargeProjectPlannerTaskCard
 * --------------------------------------------------------------------------
 * Presentational kort för ett item i large_project_booking_plan_items.
 * All mutation går via callbacks → useLargeProjectPlannerItems → service.
 * Skriver ALDRIG till calendar_events / staff_assignments / BSA / LPTA.
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Hash, Clock, User, Trash2, GripVertical } from 'lucide-react';
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';
import { PLANNER_DND_MIME, type PlannerDragPayload } from './plannerDnd';

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
  unplanned: 'bg-muted text-muted-foreground',
  planned: 'bg-primary/15 text-primary',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  blocked: 'bg-destructive/15 text-destructive',
};

const STATUS_RING: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'border-dashed border-border/60',
  planned: 'border-border/60',
  in_progress: 'border-amber-500/50 ring-1 ring-amber-500/30',
  done: 'border-emerald-500/40 opacity-70',
  blocked: 'border-destructive/50 ring-1 ring-destructive/30 bg-destructive/5',
};

const STATUS_LABEL: Record<LargeProjectBookingPlanItem['status'], string> = {
  unplanned: 'Ej planerad',
  planned: 'Planerad',
  in_progress: 'Pågår',
  done: 'Klar',
  blocked: 'Blockerad',
};

const SOURCE_TONE: Record<LargeProjectBookingPlanItem['source'], string> = {
  booking: 'border-primary/40 text-primary',
  manual: 'border-foreground/30 text-foreground',
  split: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
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
      className={`group relative rounded-md border bg-card px-2 py-1.5 text-xs shadow-sm transition hover:border-primary/50 hover:bg-primary/5 ${
        STATUS_RING[item.status]
      } ${onClick ? 'cursor-pointer' : ''} ${
        draggable ? 'active:cursor-grabbing' : ''
      } ${compact ? 'space-y-0.5' : 'space-y-1'}`}
    >
      {draggable && (
        <GripVertical className="pointer-events-none absolute left-0 top-1.5 h-3 w-3 -translate-x-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-60" />
      )}
      <div className="flex items-start justify-between gap-1">
        <div
          className={`font-medium leading-tight text-foreground line-clamp-2 ${
            item.status === 'done' ? 'line-through decoration-emerald-500/60' : ''
          }`}
        >
          {item.title}
        </div>
        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 opacity-0 transition group-hover:opacity-100"
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

      {(booking?.booking_number || timeLabel) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {booking?.booking_number && (
            <span className="inline-flex items-center gap-0.5">
              <Hash className="h-2.5 w-2.5" />
              {booking.booking_number}
            </span>
          )}
          {timeLabel && (
            <span className="inline-flex items-center gap-0.5">
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
          className={`rounded px-1 py-0.5 text-[9px] font-medium ${STATUS_TONE[item.status]}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
        <Badge
          variant="outline"
          className={`px-1 py-0 text-[9px] font-normal ${SOURCE_TONE[item.source]}`}
        >
          {SOURCE_LABEL[item.source]}
        </Badge>
        {item.phase && (
          <Badge
            variant="outline"
            className="px-1 py-0 text-[9px] font-normal text-muted-foreground"
          >
            {item.phase}
          </Badge>
        )}
      </div>
    </div>
  );
};

export default LargeProjectPlannerTaskCard;
