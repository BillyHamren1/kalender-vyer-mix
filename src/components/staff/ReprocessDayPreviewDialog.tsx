import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Sparkles, ArrowRight, Check, X } from 'lucide-react';
import {
import { formatStockholmHm, formatStockholmHms } from '../../lib/staff/formatStockholmTime';
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { ActualStaffDayModel } from '@/lib/staff/actualStaffDayModel';

/**
 * ReprocessDayPreviewDialog — kör buildActualStaffDayModel för en dag och
 * visar **före/efter utan att skriva** till databasen. Admin väljer vilka
 * förslag som ska accepteras; tillämpning sker i ett separat, framtida steg.
 *
 * Designkontrakt:
 *   - INGEN automatisk skrivning. Knappen "Tillämpa valda" anropar
 *     onApply(plan) — men plan är bara avsikter. Den faktiska
 *     databas­skrivningen ligger utanför denna komponent (mobile-app-api
 *     mutation kommer senare och MÅSTE tagga rader med
 *     source='admin_reprocess' / metadata.reprocess_version).
 *   - Renderar EXAKT vad som finns i `actualModel.proposedReport` —
 *     inga hidden defaults.
 */

export type ReprocessChoice =
  | { kind: 'accept_workday_start'; iso: string }
  | { kind: 'accept_workday_end'; iso: string }
  | { kind: 'create_distribution_from_visit'; visitKey: string }
  | { kind: 'approve_travel'; travelLogId: string }
  | { kind: 'ignore_anomaly'; anomalyId: string }
  | { kind: 'keep_current' };

interface Props {
  open: boolean;
  onClose: () => void;
  staffName: string;
  date: string;
  model: ActualStaffDayModel;
  /**
   * Anropas när admin klickar "Tillämpa valda". Plan är ENDAST avsikter —
   * caller ansvarar för att skriva till databasen med rätt source-tagg.
   * Tills mutation-pathen är byggd är detta en no-op + toast.
   */
  onApply?: (plan: ReprocessChoice[]) => void;
}

const fmtHm = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return formatStockholmHm(iso);
  } catch {
    return formatStockholmHm(iso);
  }
};
const fmtMin = (m: number) => {
  if (!m || m < 0) return '0h';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

const DiffRow: React.FC<{ label: string; current: React.ReactNode; proposed: React.ReactNode; changed: boolean }> = ({
  label,
  current,
  proposed,
  changed,
}) => (
  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs py-1.5 border-b last:border-0">
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label} – nuvarande</div>
      <div className="tabular-nums">{current}</div>
    </div>
    <ArrowRight className={`h-3 w-3 ${changed ? 'text-primary' : 'text-muted-foreground'}`} />
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">Föreslagen</div>
      <div className={`tabular-nums ${changed ? 'font-semibold text-primary' : ''}`}>{proposed}</div>
    </div>
  </div>
);

export const ReprocessDayPreviewDialog: React.FC<Props> = ({
  open,
  onClose,
  staffName,
  date,
  model,
  onApply,
}) => {
  const wd = model.reportState.workday;
  const proposedStart = model.proposedReport.proposedWorkdayStart;
  const proposedEnd = model.proposedReport.proposedWorkdayEnd;
  const startChanged = !!proposedStart && proposedStart !== wd?.started_at;
  const endChanged = !!proposedEnd && proposedEnd !== (wd?.ended_at ?? null);

  const travelSuggestions = useMemo(
    () => model.reportState.travelLogs.filter(t => !t.approved && (t.autoDetected || t.source === 'gap_derived')),
    [model.reportState.travelLogs],
  );

  // Vistelser utan motsvarande time_report (heuristik: ingen TR vars
  // [start,end] överlappar visit-intervallet).
  const orphanVisits = useMemo(() => {
    return model.actualVisits.filter(v => {
      const vs = new Date(v.start).getTime();
      const ve = new Date(v.end).getTime();
      return !model.reportState.timeReports.some(r => {
        const rs = new Date(r.start_iso).getTime();
        const re = r.end_iso ? new Date(r.end_iso).getTime() : Date.now();
        return rs < ve && re > vs;
      });
    });
  }, [model.actualVisits, model.reportState.timeReports]);

  // Selection state
  const [acceptStart, setAcceptStart] = useState(false);
  const [acceptEnd, setAcceptEnd] = useState(false);
  const [chosenVisits, setChosenVisits] = useState<Record<string, boolean>>({});
  const [chosenTravel, setChosenTravel] = useState<Record<string, boolean>>({});
  const [ignoredAnomalies, setIgnoredAnomalies] = useState<Record<string, boolean>>({});

  const buildPlan = (): ReprocessChoice[] => {
    const plan: ReprocessChoice[] = [];
    if (acceptStart && proposedStart) plan.push({ kind: 'accept_workday_start', iso: proposedStart });
    if (acceptEnd && proposedEnd) plan.push({ kind: 'accept_workday_end', iso: proposedEnd });
    for (const [k, v] of Object.entries(chosenVisits)) {
      if (v) plan.push({ kind: 'create_distribution_from_visit', visitKey: k });
    }
    for (const [k, v] of Object.entries(chosenTravel)) {
      if (v) plan.push({ kind: 'approve_travel', travelLogId: k });
    }
    for (const [k, v] of Object.entries(ignoredAnomalies)) {
      if (v) plan.push({ kind: 'ignore_anomaly', anomalyId: k });
    }
    if (plan.length === 0) plan.push({ kind: 'keep_current' });
    return plan;
  };

  const planCount = (() => {
    let n = 0;
    if (acceptStart) n++;
    if (acceptEnd) n++;
    n += Object.values(chosenVisits).filter(Boolean).length;
    n += Object.values(chosenTravel).filter(Boolean).length;
    n += Object.values(ignoredAnomalies).filter(Boolean).length;
    return n;
  })();

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Räkna om dag — {staffName}, {date}
          </DialogTitle>
          <DialogDescription>
            Förhandsvisning av vad GPS + timers föreslår. <strong>Inget skrivs automatiskt.</strong>{' '}
            Markera vilka ändringar du vill tillämpa.
          </DialogDescription>
        </DialogHeader>

        {/* Workday-diff */}
        <section className="rounded-lg border p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Arbetsdag (workday)
          </h4>
          <DiffRow
            label="Start"
            current={fmtHm(wd?.started_at ?? null)}
            proposed={fmtHm(proposedStart)}
            changed={startChanged}
          />
          <DiffRow
            label="Slut"
            current={wd?.ended_at ? fmtHm(wd.ended_at) : <span className="text-muted-foreground italic">pågår</span>}
            proposed={proposedEnd ? fmtHm(proposedEnd) : <span className="text-muted-foreground italic">pågår</span>}
            changed={endChanged}
          />
          {(startChanged || endChanged) && (
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {startChanged && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={acceptStart} onCheckedChange={v => setAcceptStart(!!v)} />
                  Acceptera ny start
                </label>
              )}
              {endChanged && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <Checkbox checked={acceptEnd} onCheckedChange={v => setAcceptEnd(!!v)} />
                  Acceptera nytt slut
                </label>
              )}
            </div>
          )}
        </section>

        {/* Distribution-diff */}
        <section className="rounded-lg border p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Fördelning (time_reports)
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs mb-2">
            <div className="rounded border bg-muted/20 px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Nuvarande</div>
              <div className="tabular-nums font-medium">{fmtMin(model.proposedReport.distributedMinutes)}</div>
            </div>
            <div className="rounded border bg-muted/20 px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Ofördelad efter förslag</div>
              <div
                className={`tabular-nums font-medium ${
                  model.proposedReport.undistributedMinutes > 0 ? 'text-amber-600' : ''
                }`}
              >
                {fmtMin(model.proposedReport.undistributedMinutes)}
              </div>
            </div>
          </div>
          {orphanVisits.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              GPS-vistelserna täcks redan av befintliga rapporter.
            </div>
          ) : (
            <ul className="space-y-1">
              {orphanVisits.map(v => (
                <li key={v.key} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                  <Checkbox
                    checked={!!chosenVisits[v.key]}
                    onCheckedChange={c => setChosenVisits(prev => ({ ...prev, [v.key]: !!c }))}
                  />
                  <span className="tabular-nums text-muted-foreground w-24">
                    {fmtHm(v.start)}–{fmtHm(v.end)}
                  </span>
                  <span className="flex-1 truncate">{v.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {fmtMin(v.durationMin)}
                  </Badge>
                  <Badge className="text-[10px] bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                    saknar rapport
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Travel-diff */}
        <section className="rounded-lg border p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Restid (travel_time_logs)
          </h4>
          <div className="grid grid-cols-2 gap-3 text-xs mb-2">
            <div className="rounded border bg-muted/20 px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Godkänd</div>
              <div className="tabular-nums font-medium">
                {fmtMin(
                  Math.round(
                    model.reportState.travelLogs
                      .filter(t => t.approved)
                      .reduce((s, t) => s + t.hours * 60, 0),
                  ),
                )}
              </div>
            </div>
            <div className="rounded border bg-muted/20 px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Föreslagen (ej godkänd)</div>
              <div className="tabular-nums font-medium">
                {fmtMin(model.proposedReport.suggestedTravelMinutes)}
              </div>
            </div>
          </div>
          {travelSuggestions.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Inga restids-förslag att granska.</div>
          ) : (
            <ul className="space-y-1">
              {travelSuggestions.map(t => (
                <li key={t.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                  <Checkbox
                    checked={!!chosenTravel[t.id]}
                    onCheckedChange={c => setChosenTravel(prev => ({ ...prev, [t.id]: !!c }))}
                  />
                  <span className="tabular-nums text-muted-foreground w-24">
                    {fmtHm(t.start_iso)}
                    {t.end_iso ? `–${fmtHm(t.end_iso)}` : ''}
                  </span>
                  <span className="flex-1 truncate">
                    {t.fromAddress ?? '?'} → {t.toAddress ?? '?'}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {fmtMin(Math.round(t.hours * 60))}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t.source === 'gap_derived' ? 'lucka' : 'GPS'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Anomalies */}
        {model.proposedReport.anomalies.length > 0 && (
          <section className="rounded-lg border p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Avvikelser
            </h4>
            <ul className="space-y-1">
              {model.proposedReport.anomalies.map(a => (
                <li key={a.id} className="flex items-start gap-2 text-xs py-1 border-b last:border-0">
                  <Checkbox
                    checked={!!ignoredAnomalies[a.id]}
                    onCheckedChange={c => setIgnoredAnomalies(prev => ({ ...prev, [a.id]: !!c }))}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{a.label}</div>
                    {a.detail && <div className="text-muted-foreground">{a.detail}</div>}
                    {a.suggestion && <div className="italic text-foreground/80">→ {a.suggestion}</div>}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      a.severity === 'critical'
                        ? 'border-destructive/40 text-destructive'
                        : a.severity === 'warning'
                          ? 'border-amber-300 text-amber-700'
                          : ''
                    }`}
                  >
                    {a.severity}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">ignorera</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <strong>Förhandsvisning — inga ändringar skrivs ännu.</strong> Denna dialog visar bara
          vilka korrigeringar som <em>skulle</em> göras. När mutation-pathen är byggd kommer alla
          ändringar märkas med <code>source='admin_reprocess'</code> /{' '}
          <code>metadata.reprocess_version</code> så att de går att granska och ångra.
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-3.5 w-3.5 mr-1.5" />
            Stäng
          </Button>
          <Button
            variant="secondary"
            disabled={planCount === 0 || !onApply}
            onClick={() => {
              onApply?.(buildPlan());
              onClose();
            }}
            title="Visar förslagen i en sammanfattning. Inget skrivs till databasen."
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Förhandsvisa ändringsförslag ({planCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
