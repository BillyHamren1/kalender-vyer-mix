/**
 * StaffDayRemindersBanner — Lager 5.6 in-app påminnelser.
 *
 * Visar små banners högst upp i TodayTab när:
 *   - gårdagens tid inte är inskickad
 *   - dagens dag är klar att godkänna
 *   - en redigering behöver bekräftas
 *
 * Klick → /m/report?date=YYYY-MM-DD (godkännandeflödet).
 * Avfärda → klientsidan tystas i 6 h via localStorage.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { useStaffDayReminders, type StaffDayReminder } from '@/hooks/useStaffDayReminders';

const TONE: Record<StaffDayReminder['severity'], { box: string; icon: React.ReactNode }> = {
  info: {
    box: 'border-blue-300/40 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  warning: {
    box: 'border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100',
    icon: <Bell className="w-4 h-4" />,
  },
  critical: {
    box: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
};

const StaffDayRemindersBanner: React.FC = () => {
  const navigate = useNavigate();
  const { effectiveStaffId } = useMobileAuth();
  const { reminders, dismiss } = useStaffDayReminders({ staffId: effectiveStaffId });

  if (reminders.length === 0) return null;

  return (
    <div className="space-y-2">
      {reminders.map((r) => {
        const tone = TONE[r.severity];
        return (
          <div
            key={r.dedupeKey}
            className={cn('rounded-xl border p-3 flex items-start gap-2', tone.box)}
          >
            <div className="mt-0.5 shrink-0">{tone.icon}</div>
            <button
              type="button"
              className="flex-1 text-left"
              onClick={() => navigate(r.linkPath)}
            >
              <div className="font-semibold text-sm">{r.title}</div>
              <div className="text-xs opacity-90">{r.body}</div>
              <div className="text-[10px] opacity-70 mt-0.5">Tryck för att granska {r.date}</div>
            </button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={() => dismiss(r.dedupeKey)}
              aria-label="Avfärda påminnelse"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default StaffDayRemindersBanner;
