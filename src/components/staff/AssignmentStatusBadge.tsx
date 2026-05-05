import React from 'react';
import {
  AssignmentTimeStatus,
  ASSIGNMENT_STATUS_LABEL,
  ASSIGNMENT_STATUS_CLASS,
} from '@/lib/staff/assignmentTimeStatus';
import { cn } from '@/lib/utils';

interface AssignmentStatusBadgeProps {
  status: AssignmentTimeStatus;
  actualMinutes?: number;
  compact?: boolean;
  className?: string;
}

const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return `${min}m`;
};

export const AssignmentStatusBadge: React.FC<AssignmentStatusBadgeProps> = ({
  status,
  actualMinutes,
  compact,
  className,
}) => {
  const label = ASSIGNMENT_STATUS_LABEL[status];
  const baseCls = ASSIGNMENT_STATUS_CLASS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium',
        compact ? 'text-[10px] leading-none' : 'text-xs',
        baseCls,
        className,
      )}
      title={actualMinutes ? `${label} · ${formatMinutes(actualMinutes)}` : label}
    >
      <span className="truncate">{label}</span>
      {!compact && actualMinutes ? (
        <span className="opacity-80">· {formatMinutes(actualMinutes)}</span>
      ) : null}
    </span>
  );
};

export default AssignmentStatusBadge;
