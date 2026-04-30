/**
 * EditTimeReportDialog
 *
 * Admin-redigering av en enskild `time_reports`-rad direkt från
 * StaffTimeReportsTable. Fält: starttid, sluttid, rast (min), beskrivning.
 *
 * Varnar tydligt och kräver explicit bekräftelse om raden är attesterad
 * (skickar då `force=true` till admin_update_time_report; backend loggar
 * detta i `time_report_edit_log`).
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface EditTimeReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeReportId: string;
  staffName: string;
  initialStartTime: string | null;   // 'HH:mm' eller ISO
  initialEndTime: string | null;     // 'HH:mm' eller ISO
  initialBreakHours?: number;
  initialDescription?: string | null;
  isApproved?: boolean;
}

const toHHmm = (v: string | null): string => {
  if (!v) return '';
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
};

export const EditTimeReportDialog: React.FC<EditTimeReportDialogProps> = ({
  open,
  onOpenChange,
  timeReportId,
  staffName,
  initialStartTime,
  initialEndTime,
  initialBreakHours = 0,
  initialDescription = '',
  isApproved = false,
}) => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [breakMin, setBreakMin] = useState('0');
  const [description, setDescription] = useState('');
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setStart(toHHmm(initialStartTime));
    setEnd(toHHmm(initialEndTime));
    setBreakMin(String(Math.round((initialBreakHours || 0) * 60)));
    setDescription(initialDescription || '');
    setConfirmOverride(false);
  }, [open, initialStartTime, initialEndTime, initialBreakHours, initialDescription]);

  const handleSave = async () => {
    if (isApproved && !confirmOverride) return;
    setSaving(true);
    try {
      const breakHours = Math.max(0, Number(breakMin) || 0) / 60;
      await mobileApi.adminUpdateTimeReport({
        time_report_id: timeReportId,
        start_time: start || null,
        end_time: end || null,
        break_time: breakHours,
        description: description || null,
        force: isApproved ? true : undefined,
      });
      toast({ title: 'Tidrapport uppdaterad', description: staffName });
      qc.invalidateQueries({ queryKey: ['staff-time-reports'] });
      qc.invalidateQueries({ queryKey: ['staff-time-reports-detail'] });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Kunde inte spara',
        description: e?.message || 'Okänt fel',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redigera tidrapport</DialogTitle>
          <DialogDescription>{staffName}</DialogDescription>
        </DialogHeader>

        {isApproved && (
          <Alert variant="destructive" className="border-destructive/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Tidrapporten är <strong>attesterad</strong>. Ändringen åsidosätter låset
              och loggas i revisionsloggen.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start">Starttid</Label>
              <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end">Sluttid</Label>
              <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="break">Rast (minuter)</Label>
            <Input
              id="break"
              type="number"
              min={0}
              max={240}
              step={5}
              value={breakMin}
              onChange={(e) => setBreakMin(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desc">Beskrivning</Label>
            <Textarea
              id="desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valfri kommentar"
            />
          </div>

          {isApproved && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmOverride}
                onChange={(e) => setConfirmOverride(e.target.checked)}
              />
              <span>Jag förstår att jag ändrar en attesterad rapport.</span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !start || !end || (isApproved && !confirmOverride)}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
