/**
 * StopTimerDialog
 *
 * Adminverb för att stoppa en pågående timer i StaffTimeReportsTable.
 * Stödjer alla tre källtabeller:
 *   - time_reports        → admin_update_time_report (sätter end_time)
 *   - location_time_entries → admin_close_open_entry
 *   - travel_time_logs    → admin_close_open_entry
 *
 * Default-sluttid = nu (rundat till närmsta minut). Användaren kan justera.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Square } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

export type StopTarget =
  | { kind: 'time_report'; id: string; reportDate: string; startIso: string }
  | { kind: 'location_time_entries'; id: string; startIso: string }
  | { kind: 'travel_time_logs'; id: string; startIso: string };

interface StopTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StopTarget | null;
  staffName: string;
  sessionLabel: string;
}

const nowHHmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const StopTimerDialog: React.FC<StopTimerDialogProps> = ({
  open,
  onOpenChange,
  target,
  staffName,
  sessionLabel,
}) => {
  const [endTime, setEndTime] = useState(nowHHmm());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (open) setEndTime(nowHHmm());
  }, [open]);

  const startInfo = useMemo(() => {
    if (!target) return '';
    try { return format(new Date(target.startIso), 'HH:mm'); } catch { return ''; }
  }, [target]);

  const handleStop = async () => {
    if (!target) return;
    setSaving(true);
    try {
      if (target.kind === 'time_report') {
        await mobileApi.adminUpdateTimeReport({
          time_report_id: target.id,
          end_time: endTime,
        });
      } else {
        // Build ISO from today's date + endTime (HH:mm).
        // If the user picked a time *earlier* than the start clock, assume the
        // shift crosses midnight and use start's date+1.
        const start = new Date(target.startIso);
        const [h, m] = endTime.split(':').map(Number);
        const candidate = new Date(start);
        candidate.setHours(h, m, 0, 0);
        if (candidate.getTime() <= start.getTime()) {
          candidate.setDate(candidate.getDate() + 1);
        }
        await mobileApi.adminCloseOpenEntry({
          table: target.kind,
          id: target.id,
          end_iso: candidate.toISOString(),
        });
      }
      toast({ title: 'Timer stoppad', description: `${staffName} · ${sessionLabel}` });
      qc.invalidateQueries({ queryKey: ['staff-time-reports-day'] });
      qc.invalidateQueries({ queryKey: ['staff-time-reports-detail'] });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Kunde inte stoppa timer',
        description: e?.message || 'Okänt fel',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Square className="h-4 w-4 text-destructive fill-destructive" />
            Stoppa timer
          </DialogTitle>
          <DialogDescription>
            {staffName} · {sessionLabel}
            {startInfo && <span className="block text-xs mt-1">Startade {startInfo}</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="endtime">Sluttid</Label>
            <Input
              id="endtime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Förvald = nu. Justera vid behov.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button variant="destructive" onClick={handleStop} disabled={saving || !endTime}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Stoppa nu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
