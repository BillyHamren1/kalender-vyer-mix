/**
 * DayApprovalAction
 * ─────────────────────────────────────────────────────────────────────
 * Knapp + override-dialog för att godkänna en hel arbetsdag.
 *
 * - Disabled när hårda blockers finns (öppen workday, öppen timer,
 *   pending assistent-händelser).
 * - "Godkänn dag" direkt om dagen är ren.
 * - "Godkänn ändå…" öppnar dialog med tvingande kommentar om dagen
 *   bara har soft critical anomalies.
 * - "Ångra godkännande" om dagen redan är approved.
 *
 * Kallar mobile-app-api actions: admin_approve_day / admin_unapprove_day.
 * Cascade-godkännande av time_reports + travel_time_logs sker server-side.
 */
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ShieldCheck, AlertTriangle, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import {
  evaluateDayApprovability,
  type AdminTimeReviewResult,
  type ReviewWorkdayInput,
  type ReviewOpenTimer,
  type ReviewAssistantEvent,
} from '@/lib/admin/adminTimeReviewEngine';

export interface DayApprovalActionProps {
  workdayId: string | null;
  workday: ReviewWorkdayInput | null;
  result: AdminTimeReviewResult;
  reviewStatus: 'open' | 'needs_review' | 'approved';
  /** Optional — running timer (set when day is still live). */
  openTimer?: ReviewOpenTimer | null;
  /** Optional — pending assistant events for the day. */
  assistantEvents?: ReviewAssistantEvent[];
  /** Compact = small inline button, full = primary CTA in detail view. */
  variant?: 'compact' | 'full';
  /** Called after successful approve/unapprove so caller can refresh. */
  onApproved?: () => void;
}

export const DayApprovalAction: React.FC<DayApprovalActionProps> = ({
  workdayId,
  workday,
  result,
  reviewStatus,
  openTimer = null,
  assistantEvents = [],
  variant = 'full',
  onApproved,
}) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const approvability = useMemo(
    () => evaluateDayApprovability(result, { workday, openTimer, assistantEvents }),
    [result, workday, openTimer, assistantEvents],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-time-review'] });
    onApproved?.();
  };

  const callApprove = async (force: boolean, reason?: string) => {
    if (!workdayId) {
      toast({ title: 'Ingen workday', description: 'Dagen saknar workday-rad.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const res = await mobileApi.adminApproveDay({
        workday_id: workdayId,
        force,
        override_reason: reason ?? null,
      });
      const cascaded =
        (res?.cascaded_time_reports ?? 0) + (res?.cascaded_travel_logs ?? 0);
      toast({
        title: force ? 'Dag godkänd (override)' : 'Dag godkänd',
        description: `${cascaded} rader markerades approved.`,
      });
      setOverrideOpen(false);
      setOverrideReason('');
      refresh();
    } catch (e: any) {
      const msg = e?.message || 'Okänt fel';
      toast({
        title: 'Kunde inte godkänna',
        description: msg.includes('open_timer')
          ? 'En aktivitet eller resa är fortfarande igång.'
          : msg.includes('workday_open')
            ? 'Arbetsdagen är fortfarande öppen.'
            : msg.includes('pending_assistant_events')
              ? 'Det finns assistent-händelser som behöver behandlas.'
              : msg,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const callUnapprove = async () => {
    if (!workdayId) return;
    setBusy(true);
    try {
      await mobileApi.adminUnapproveDay({ workday_id: workdayId });
      toast({ title: 'Godkännande borttaget', description: 'Dagen är åter i needs_review.' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Kunde inte ångra', description: e?.message || 'Okänt fel', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  // ─── Already approved ───
  if (reviewStatus === 'approved') {
    return (
      <Button
        size={variant === 'compact' ? 'sm' : 'default'}
        variant="outline"
        disabled={busy}
        onClick={callUnapprove}
        className="gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        Ångra godkännande
      </Button>
    );
  }

  // ─── Hard-blocked ───
  if (!approvability.canApprove && !approvability.canOverride) {
    return (
      <Button
        size={variant === 'compact' ? 'sm' : 'default'}
        variant="outline"
        disabled
        title={approvability.reason ?? undefined}
        className="gap-2"
      >
        <ShieldCheck className="w-4 h-4 opacity-50" />
        Kan inte godkänna
      </Button>
    );
  }

  // ─── Override needed ───
  if (!approvability.canApprove && approvability.canOverride) {
    return (
      <>
        <Button
          size={variant === 'compact' ? 'sm' : 'default'}
          variant="destructive"
          disabled={busy}
          onClick={() => setOverrideOpen(true)}
          className="gap-2"
        >
          <AlertTriangle className="w-4 h-4" />
          Godkänn ändå…
        </Button>

        <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Godkänn dag med kritiska avvikelser
              </DialogTitle>
              <DialogDescription>
                Dagen har {approvability.criticalAnomalies.length} kritiska avvikelser. Skriv en kommentar
                som förklarar varför du godkänner ändå — den sparas i loggen.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-1">
                {approvability.criticalAnomalies.map((a) => (
                  <div key={a.kind} className="flex gap-2">
                    <span className="font-medium">{a.label}:</span>
                    <span className="text-muted-foreground">{a.detail}</span>
                  </div>
                ))}
              </div>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Förklara varför dagen godkänns trots avvikelser…"
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOverrideOpen(false)} disabled={busy}>
                Avbryt
              </Button>
              <Button
                variant="destructive"
                disabled={busy || overrideReason.trim().length < 3}
                onClick={() => callApprove(true, overrideReason.trim())}
                className="gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Godkänn med override
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ─── Clean approval ───
  return (
    <Button
      size={variant === 'compact' ? 'sm' : 'default'}
      disabled={busy}
      onClick={() => callApprove(false)}
      className="gap-2"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
      Godkänn dag
    </Button>
  );
};

export default DayApprovalAction;
