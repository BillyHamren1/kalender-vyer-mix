/**
 * DecisionTraceDrawer
 * ──────────────────────────────────────────────────────────────────
 * Read-only audit/felsökningsdrawer för EN person + EN dag.
 *
 * Detta är INTE huvudtimelinen. Det här är "Visa tolkning" — hela
 * beslutskedjan motorn använder för att producera reportCandidate-
 * blocken som visas i StaffDayTimelineCard:
 *
 *   Raw GPS / tekniska händelser
 *     → Presence block
 *       → Report candidate
 *         → Display block
 *
 * Endast rendering. Inga writes. Inga API-calls. All data kommer som
 * props från StaffTimeReports → StaffTimeReportsList → här.
 */

import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import type {
  ReportCandidateBlockUI,
  ReportCandidateSummaryUI,
} from './ReportCandidateTimeline';

export interface DecisionTraceDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffName: string;
  staffId: string;
  date: string;
  engineMode?: 'report_candidate' | 'actual_model_fallback';
  reportCandidateBlocks: ReportCandidateBlockUI[];
  reportCandidateSummary: ReportCandidateSummaryUI | null;
  presenceDayBlocks: any[];
  presenceDayBlocksRawEvidence: any[];
  rawGpsTimeline: any | null;
  technicalTimeline: any[];
  targets: any[];
  targetResolution: any | null;
  reportCandidateDiagnostics: any | null;
  targetMatchSummary: any | null;
  counts: any | null;
}

// ── helpers ────────────────────────────────────────────────────────
const fmtHm = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    return formatStockholmHm(String(iso));
  } catch {
    return String(iso);
  }
};

const fmtMin = (m: number | null | undefined): string => {
  const n = Number(m ?? 0);
  if (!n || n < 0) return '0m';
  const h = Math.floor(n / 60);
  const min = Math.round(n % 60);
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
};

const KIND_TONE: Record<string, string> = {
  work: 'bg-primary/10 text-primary border-primary/30',
  transport: 'bg-blue-50 text-blue-700 border-blue-300/60 dark:bg-blue-950/40 dark:text-blue-200',
  unknown: 'bg-muted/40 text-muted-foreground border-border',
  needs_review: 'bg-amber-50 text-amber-800 border-amber-300/60 dark:bg-amber-950/40 dark:text-amber-200',
  break: 'bg-muted/30 text-muted-foreground border-border',
};

function KindBadge({ kind }: { kind: string | null | undefined }) {
  const k = String(kind ?? 'unknown');
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        KIND_TONE[k] ?? KIND_TONE.unknown
      }`}
    >
      {k}
    </span>
  );
}

function JsonBlock({ value }: { value: any }) {
  let text = '';
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="max-h-[400px] overflow-auto rounded-md border bg-muted/30 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all">
      {text || '—'}
    </pre>
  );
}

function CollapsibleJson({ title, value, defaultOpen = false }: { title: string; value: any; defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs font-medium hover:bg-muted/40">
        <span>{title}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <JsonBlock value={value} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

// ── tab contents ───────────────────────────────────────────────────
function OverviewTab(props: DecisionTraceDrawerProps) {
  const s = props.reportCandidateSummary;
  const tr = props.targetResolution;
  const diag = props.reportCandidateDiagnostics;
  const rawGpsCount = Array.isArray(props.rawGpsTimeline?.segments)
    ? props.rawGpsTimeline.segments.length
    : Array.isArray(props.rawGpsTimeline)
      ? props.rawGpsTimeline.length
      : 0;
  const pingsCount = Array.isArray(props.rawGpsTimeline?.pings)
    ? props.rawGpsTimeline.pings.length
    : null;
  const warnings: string[] = [];
  if (diag?.warnings && Array.isArray(diag.warnings)) warnings.push(...diag.warnings.map(String));
  if (tr?.warnings && Array.isArray(tr.warnings)) warnings.push(...tr.warnings.map(String));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Report candidates" value={props.reportCandidateBlocks.length} />
        <Stat label="Presence blocks" value={props.presenceDayBlocks.length} />
        <Stat label="Raw GPS-segment" value={rawGpsCount} />
        {pingsCount != null && <Stat label="GPS-pings" value={pingsCount} />}
        <Stat label="Tekniska events" value={props.technicalTimeline.length} />
        <Stat label="Targets" value={props.targets.length} />
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Arbete" value={fmtMin(s.workMinutes)} />
          <Stat label="Transport" value={fmtMin(s.transportMinutes)} />
          <Stat label="Okänd" value={fmtMin(s.unknownMinutes)} />
          <Stat label="Granska" value={fmtMin(s.needsReviewMinutes)} />
        </div>
      )}

      {tr && (
        <div className="rounded-md border bg-muted/10 p-3">
          <div className="mb-2 text-xs font-semibold">Target resolution</div>
          <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-3">
            {Object.entries(tr).slice(0, 24).map(([k, v]) => {
              if (v === null || v === undefined) return null;
              if (typeof v === 'object') return null;
              return (
                <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-0.5">
                  <span className="text-muted-foreground truncate">{k}</span>
                  <span className="font-mono tabular-nums">{String(v)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" /> Varningar
          </div>
          <ul className="ml-4 list-disc text-[11px] text-amber-900 dark:text-amber-200">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChainTab(props: DecisionTraceDrawerProps) {
  if (props.reportCandidateBlocks.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground">
        Inga reportCandidateBlocks för dagen.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {props.reportCandidateBlocks.map((b) => {
        const ev: any = b.evidenceSummary ?? null;
        return (
          <div key={b.id} className="rounded-md border bg-card p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KindBadge kind={b.kind} />
                <span className="font-mono tabular-nums">
                  {fmtHm(b.startAt)} – {fmtHm(b.endAt)}
                </span>
                <span className="text-muted-foreground">({fmtMin(b.durationMinutes)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{b.confidence}</Badge>
                {b.reviewState && b.reviewState !== 'ok' && (
                  <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
                    {b.reviewState}
                  </Badge>
                )}
              </div>
            </div>
            <div className="mt-1.5 font-medium">{b.title}</div>
            {(b.subtitle || b.targetLabel) && (
              <div className="text-[11px] text-muted-foreground">{b.subtitle || b.targetLabel}</div>
            )}

            {/* Decision chain */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="rounded border bg-muted/30 px-1.5 py-0.5">
                Raw GPS / events
              </span>
              <span>→</span>
              <span className="rounded border bg-muted/30 px-1.5 py-0.5">
                Presence ({b.sourcePresenceBlockIds?.length ?? 0})
              </span>
              <span>→</span>
              <span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-primary">
                Report candidate
              </span>
              <span>→</span>
              <span className="rounded border bg-muted/30 px-1.5 py-0.5">Display</span>
            </div>

            {b.reviewReasons && b.reviewReasons.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Review reasons</div>
                <ul className="ml-4 list-disc text-[11px]">
                  {b.reviewReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
              {b.signalGapMinutes != null && (
                <div className="text-muted-foreground">
                  Signal gap: <span className="font-mono">{fmtMin(b.signalGapMinutes)}</span>
                </div>
              )}
              {b.firstConfirmedAt && (
                <div className="text-muted-foreground">
                  First confirmed: <span className="font-mono">{fmtHm(b.firstConfirmedAt)}</span>
                </div>
              )}
              {b.lastConfirmedAt && (
                <div className="text-muted-foreground">
                  Last confirmed: <span className="font-mono">{fmtHm(b.lastConfirmedAt)}</span>
                </div>
              )}
              {b.hiddenSignalGapIds && b.hiddenSignalGapIds.length > 0 && (
                <div className="text-muted-foreground">
                  Hidden gaps: <span className="font-mono">{b.hiddenSignalGapIds.length}</span>
                </div>
              )}
            </div>

            {ev && (
              <div className="mt-2">
                <CollapsibleJson title="evidenceSummary" value={ev} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PresenceTab(props: DecisionTraceDrawerProps) {
  if (props.presenceDayBlocks.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground">
        Inga presenceDayBlocks för dagen.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {props.presenceDayBlocks.map((p: any, i: number) => {
        const start = p.startAt ?? p.start_at ?? p.start ?? p.entered_at ?? null;
        const end = p.endAt ?? p.end_at ?? p.end ?? p.exited_at ?? null;
        const evidence = p.evidence ?? p.locationEvidence ?? null;
        return (
          <div key={p.id ?? i} className="rounded-md border bg-card p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KindBadge kind={p.kind ?? p.status} />
                <span className="font-mono tabular-nums">
                  {fmtHm(start)} – {fmtHm(end)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {p.confidence && (
                  <Badge variant="outline" className="text-[10px]">{String(p.confidence)}</Badge>
                )}
                {p.confirmed === true && (
                  <Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-700">
                    confirmed
                  </Badge>
                )}
                {p.probable === true && !p.confirmed && (
                  <Badge variant="outline" className="text-[10px]">probable</Badge>
                )}
                {p.signalGap === true && (
                  <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
                    signal_gap
                  </Badge>
                )}
              </div>
            </div>
            {(p.targetLabel || p.label) && (
              <div className="mt-1 truncate">{p.targetLabel ?? p.label}</div>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              {p.source && <span>source: {String(p.source)}</span>}
              {p.id && <span>id: {String(p.id).slice(0, 8)}</span>}
              {p.targetId && <span>target: {String(p.targetId).slice(0, 8)}</span>}
            </div>
            {evidence && (
              <div className="mt-2">
                <CollapsibleJson title="evidence" value={evidence} />
              </div>
            )}
          </div>
        );
      })}
      {props.presenceDayBlocksRawEvidence.length > 0 && (
        <CollapsibleJson title="presenceDayBlocksRawEvidence" value={props.presenceDayBlocksRawEvidence} />
      )}
    </div>
  );
}

function TargetsTab(props: DecisionTraceDrawerProps) {
  const tr = props.targetResolution;
  const unsafe = Number(tr?.unsafeAutoMatchedTargetsCount ?? 0) > 0;
  if (props.targets.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 p-6 text-center text-xs text-muted-foreground">
        Inga targets resolved.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {unsafe && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          ⚠️ targetResolution rapporterar {tr.unsafeAutoMatchedTargetsCount} osäker auto-matchning.
        </div>
      )}
      {props.targets.map((t: any, i: number) => {
        const role = String(t.matchRole ?? t.role ?? '').toLowerCase();
        const isPrimary = role === 'primary' || t.canAutoMatchAsWork === true;
        return (
          <div
            key={t.id ?? t.targetId ?? i}
            className={`rounded-md border p-2.5 text-xs ${
              isPrimary
                ? 'border-primary/30 bg-primary/5'
                : 'bg-muted/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium truncate">{t.name ?? t.label ?? t.targetLabel ?? '(unnamed)'}</div>
              <div className="flex items-center gap-1">
                {isPrimary ? (
                  <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">
                    primary
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">secondary</Badge>
                )}
                {t.canAutoMatchAsWork === true && (
                  <Badge variant="outline" className="border-emerald-400 text-[10px] text-emerald-700">
                    auto-match
                  </Badge>
                )}
                {t.unsafe === true && (
                  <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-700">
                    unsafe
                  </Badge>
                )}
              </div>
            </div>
            {t.rawAddress && (
              <div className="mt-1 truncate text-[11px] text-muted-foreground">{t.rawAddress}</div>
            )}
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              {t.matchRole && <div>matchRole: {String(t.matchRole)}</div>}
              {t.assignmentAnchor && <div>anchor: {String(t.assignmentAnchor)}</div>}
              {t.targetSource && <div>source: {String(t.targetSource)}</div>}
              {t.addressAnchorKey && (
                <div className="truncate">addressKey: {String(t.addressAnchorKey)}</div>
              )}
              {t.distance != null && <div>distance: {Number(t.distance).toFixed(0)}m</div>}
              {t.radius != null && <div>radius: {Number(t.radius).toFixed(0)}m</div>}
              {t.targetType && <div>type: {String(t.targetType)}</div>}
              {t.targetId && <div>id: {String(t.targetId).slice(0, 8)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RawTab(props: DecisionTraceDrawerProps) {
  const segs = Array.isArray(props.rawGpsTimeline?.segments)
    ? props.rawGpsTimeline.segments
    : Array.isArray(props.rawGpsTimeline)
      ? props.rawGpsTimeline
      : [];
  const pings = Array.isArray(props.rawGpsTimeline?.pings) ? props.rawGpsTimeline.pings : [];
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-xs font-semibold">rawGpsTimeline ({segs.length} segment, {pings.length} pings)</div>
        {segs.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/10 p-3 text-center text-[11px] text-muted-foreground">
            Inga GPS-segment.
          </div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/30 text-left">
                <tr>
                  <th className="px-2 py-1 font-medium">Tid</th>
                  <th className="px-2 py-1 font-medium">Typ</th>
                  <th className="px-2 py-1 font-medium">Lat/Lng</th>
                  <th className="px-2 py-1 font-medium">Acc</th>
                  <th className="px-2 py-1 font-medium">Target</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {segs.map((s: any, i: number) => (
                  <tr key={s.id ?? i} className="border-t">
                    <td className="px-2 py-1 font-mono tabular-nums">
                      {fmtHm(s.startAt ?? s.start_at ?? s.start)} – {fmtHm(s.endAt ?? s.end_at ?? s.end)}
                    </td>
                    <td className="px-2 py-1"><KindBadge kind={s.type ?? s.kind} /></td>
                    <td className="px-2 py-1 font-mono">
                      {s.lat != null ? Number(s.lat).toFixed(4) : '—'},{' '}
                      {s.lng != null ? Number(s.lng).toFixed(4) : '—'}
                    </td>
                    <td className="px-2 py-1">{s.accuracy != null ? `${Math.round(s.accuracy)}m` : '—'}</td>
                    <td className="px-2 py-1 truncate max-w-[140px]">
                      {s.matchedTargetLabel ?? s.targetLabel ?? s.targetId ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{s.status ?? s.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold">technicalTimeline ({props.technicalTimeline.length})</div>
        {props.technicalTimeline.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/10 p-3 text-center text-[11px] text-muted-foreground">
            Inga tekniska events.
          </div>
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/30 text-left">
                <tr>
                  <th className="px-2 py-1 font-medium">Tid</th>
                  <th className="px-2 py-1 font-medium">Typ</th>
                  <th className="px-2 py-1 font-medium">Reason / status</th>
                </tr>
              </thead>
              <tbody>
                {props.technicalTimeline.map((e: any, i: number) => (
                  <tr key={e.id ?? i} className="border-t">
                    <td className="px-2 py-1 font-mono tabular-nums">
                      {fmtHm(e.ts ?? e.at ?? e.startAt ?? e.happened_at)}
                    </td>
                    <td className="px-2 py-1">{e.type ?? e.kind ?? e.event_type ?? '—'}</td>
                    <td className="px-2 py-1 text-muted-foreground truncate">
                      {e.reason ?? e.status ?? e.label ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosticsTab(props: DecisionTraceDrawerProps) {
  return (
    <div className="space-y-2">
      <CollapsibleJson title="reportCandidateDiagnostics" value={props.reportCandidateDiagnostics} defaultOpen />
      <CollapsibleJson title="targetResolution" value={props.targetResolution} />
      <CollapsibleJson title="targetMatchSummary" value={props.targetMatchSummary} />
      <CollapsibleJson title="counts" value={props.counts} />
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────
export const DecisionTraceDrawer: React.FC<DecisionTraceDrawerProps> = (props) => {
  const diag = props.reportCandidateDiagnostics;
  const tr = props.targetResolution;
  const hasWarning =
    (Array.isArray(diag?.warnings) && diag.warnings.length > 0) ||
    (Array.isArray(tr?.warnings) && tr.warnings.length > 0) ||
    Number(tr?.unsafeAutoMatchedTargetsCount ?? 0) > 0;
  const status: 'PASS' | 'WARNING' | null = diag ? (hasWarning ? 'WARNING' : 'PASS') : null;
  const engineMode = props.engineMode ?? 'report_candidate';

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Tolkning · {props.staffName}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{props.date}</span>
            <span>·</span>
            <Badge
              variant="outline"
              className={
                engineMode === 'report_candidate'
                  ? 'border-primary/40 text-primary'
                  : 'border-amber-300 text-amber-700'
              }
            >
              engine: {engineMode === 'report_candidate' ? 'reportCandidate' : 'fallback'}
            </Badge>
            {status && (
              <Badge
                variant="outline"
                className={
                  status === 'PASS'
                    ? 'border-emerald-400 text-emerald-700'
                    : 'border-amber-400 text-amber-700'
                }
              >
                {status === 'PASS' ? (
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                ) : (
                  <AlertTriangle className="mr-1 h-3 w-3" />
                )}
                {status}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 flex-wrap justify-start">
            <TabsTrigger value="overview" className="text-xs">Översikt</TabsTrigger>
            <TabsTrigger value="chain" className="text-xs">Beslutskedja</TabsTrigger>
            <TabsTrigger value="presence" className="text-xs">Närvaro</TabsTrigger>
            <TabsTrigger value="targets" className="text-xs">Targets</TabsTrigger>
            <TabsTrigger value="raw" className="text-xs">Rå GPS</TabsTrigger>
            <TabsTrigger value="diag" className="text-xs">Diagnostik</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-auto px-4 py-3">
            <TabsContent value="overview" className="mt-0"><OverviewTab {...props} /></TabsContent>
            <TabsContent value="chain" className="mt-0"><ChainTab {...props} /></TabsContent>
            <TabsContent value="presence" className="mt-0"><PresenceTab {...props} /></TabsContent>
            <TabsContent value="targets" className="mt-0"><TargetsTab {...props} /></TabsContent>
            <TabsContent value="raw" className="mt-0"><RawTab {...props} /></TabsContent>
            <TabsContent value="diag" className="mt-0"><DiagnosticsTab {...props} /></TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export default DecisionTraceDrawer;
