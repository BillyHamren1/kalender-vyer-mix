import React from 'react';
import { Briefcase, AlertCircle, CheckSquare, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MyCalendarItem } from '@/hooks/useMyCalendarItems';

interface Props {
  item: MyCalendarItem;
  compact?: boolean;
  onClick?: () => void;
}

const KIND_STYLES: Record<
  MyCalendarItem['kind'],
  { icon: typeof Briefcase; cls: string; label: string }
> = {
  project: {
    icon: Briefcase,
    cls: 'border-l-primary bg-primary/5 hover:bg-primary/10 text-primary-foreground/90',
    label: 'Projekt',
  },
  todo: {
    icon: CheckSquare,
    cls: 'border-l-blue-500 bg-blue-500/5 hover:bg-blue-500/10',
    label: 'Todo',
  },
  deadline: {
    icon: Flag,
    cls: 'border-l-amber-500 bg-amber-500/5 hover:bg-amber-500/10',
    label: 'Deadline',
  },
};

export const MyCalendarEventCard: React.FC<Props> = ({ item, compact, onClick }) => {
  const style = item.overdue
    ? { icon: AlertCircle, cls: 'border-l-destructive bg-destructive/5 hover:bg-destructive/10', label: 'Försenad' }
    : KIND_STYLES[item.kind];
  const Icon = style.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md border-l-[3px] border border-border/40 transition-colors',
        style.cls,
        compact ? 'px-2 py-1' : 'px-3 py-2',
      )}
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={cn('shrink-0 text-foreground/80', compact ? 'h-3 w-3 mt-0.5' : 'h-3.5 w-3.5 mt-0.5')} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'font-medium truncate text-foreground',
              compact ? 'text-[11px] leading-tight' : 'text-sm leading-tight',
            )}
          >
            {item.title}
          </div>
          {!compact && (item.subtitle || item.startTime) && (
            <div className="text-[11px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
              {item.startTime && <span className="tabular-nums">{item.startTime}{item.endTime ? `–${item.endTime}` : ''}</span>}
              {item.startTime && item.subtitle && <span>·</span>}
              {item.subtitle && <span className="truncate">{item.subtitle}</span>}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

export default MyCalendarEventCard;
