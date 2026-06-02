import React from "react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { AlertTriangle, Cpu, MessageSquare, Pencil, ShieldAlert } from "lucide-react";
import type { WeeklyDayCell } from "../weeklyApprovalModel";

// ─────────────────────────────────────────────────────────────────────────────
// Segment-extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface InspectionSegment {
  start?: string;
  end?: string;
  label?: string;
  type?: string;
  classification?: string;
  minutes?: number;
}

function asAny(o: unknown): any { return o as any; }

export function extractSegments(snapshot: unknown): InspectionSegment[] {
  if (!snapshot) return [];
  if (Array.isArray(snapshot)) return snapshot as InspectionSegment[];
  const o = asAny(snapshot);
  const c =
    o?.segments ??
    o?.timeline ??
    o?.blocks ??
    o?.display_segments ??
    o?.displayTimelineBlocksV2 ??
    o?.display_timeline_blocks_v2 ??
    o?.reportCandidateBlocks ??
    o?.report_candidate_blocks ??
    o?.events;
  return Array.isArray(c) ? (c as InspectionSegment[]) : [];
}

function pick(o: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

const START_KEYS = ["start", "startedAt", "started_at", "start_time", "startTime", "from", "startAt", "start_at"];
const END_KEYS = ["end", "endedAt", "ended_at", "end_time", "endTime", "to", "endAt", "end_at"];
const LABEL_KEYS = ["displayLabel", "display_label", "targetLabel", "target_label", "title", "label", "classification", "type", "kind"];

export function segStart(s: any): string | undefined { return pick(s, START_KEYS); }
export function segEnd(s: any): string | undefined { return pick(s, END_KEYS); }
export function segLabel(s: any): string { return pick(s, LABEL_KEYS) || "Okänd"; }

export function fmtTime(v: string | undefined): string {
  if (!v) return "–";
  if (/^\d{2}:\d{2}/.test(v)) return v.slice(0, 5);
  try { return format(new Date(v), "HH:mm"); } catch { return v; }
}

export function segMinutes(s: any): number | null {
  const m = s?.minutes ?? s?.durationMinutes ?? s?.duration_min ?? s?.duration;
  if (typeof m === "number" && isFinite(m)) return Math.round(m);
  const a = segStart(s); const b = segEnd(s);
  if (a && b) {
    try {
      const d = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
      return d > 0 ? Math.round(d) : null;
    } catch { /* noop */ }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics extraction
// ─────────────────────────────────────────────────────────────────────────────

export interface DiagnosticsBrief {
  engineVersion: string | null;
  builtAt: string | null;
  stale: boolean;
  error: string | null;
  pingCount: number | null;
  largestGapMin: number | null;
  warnings: string[];
}

export function extractDiagnostics(day: WeeklyDayCell): DiagnosticsBrief {
  const c = day.cache;
  if (!c) {
    return { engineVersion: null, builtAt: null, stale: false, error: null, pingCount: null, largestGapMin: null, warnings: [] };
  }
  const d = asAny(c.diagnostics_json);
  const warnings: string[] = [];
  const rawWarnings = d?.warnings ?? d?.issues;
  if (Array.isArray(rawWarnings)) {
    for (const w of rawWarnings) warnings.push(typeof w === "string" ? w : (w?.message ?? JSON.stringify(w)));
  }
  return {
    engineVersion: (c as any).engine_version ?? d?.engineVersion ?? null,
    builtAt: c.built_at ?? null,
    stale: !!c.stale,
    error: c.error ?? null,
    pingCount: typeof d?.pingCount === "number" ? d.pingCount : (typeof d?.pings === "number" ? d.pings : null),
    largestGapMin: typeof d?.largestGapMin === "number" ? d.largestGapMin : null,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-usable subcomponents
// ─────────────────────────────────────────────────────────────────────────────

// Regel (UI-only): "Boende" / private_residence-segment får ALDRIG visas
// före dagens första arbetsrelaterade ping. Vi droppar därför alla ledande
// boende-/privat-segment tills första icke-boende-segmentet inträffar.
// Efter dagens första arbetssegment renderas Boende normalt igen.
function isResidenceSegment(seg: any): boolean {
  const label = (segLabel(seg) || "").toLowerCase();
  const type = String(seg?.type ?? seg?.classification ?? seg?.kind ?? "").toLowerCase();
  if (/^\s*boende\b/.test(label)) return true;
  if (/private[_-]?residence|residence|home|boende/.test(type)) return true;
  return false;
}

function trimLeadingResidenceSegments(segments: InspectionSegment[]): InspectionSegment[] {
  let i = 0;
  while (i < segments.length && isResidenceSegment(segments[i])) i++;
  return i === 0 ? segments : segments.slice(i);
}

export const SegmentList: React.FC<{ segments: InspectionSegment[] }> = ({ segments: raw }) => {
  const segments = trimLeadingResidenceSegments(raw);
  if (segments.length === 0) {
    return <p className="text-xs italic text-muted-foreground">Inga segment i GPS-förslaget.</p>;
  }
  return (
    <ol className="space-y-1">
      {segments.slice(0, 30).map((seg, i) => {
        const m = segMinutes(seg);
        const t = (seg as any).type ?? (seg as any).classification ?? "";
        const tone = /travel|transport|resa/i.test(String(t))
          ? "text-amber-700 dark:text-amber-300"
          : /unknown|okänd|gap/i.test(String(t))
          ? "text-rose-700 dark:text-rose-300"
          : "text-foreground/85";
        return (
          <li key={i} className="flex items-start gap-2 text-xs">
            <span className="font-mono text-muted-foreground shrink-0 w-24">
              {fmtTime(segStart(seg))} – {fmtTime(segEnd(seg))}
            </span>
            <span className={`truncate flex-1 ${tone}`}>{segLabel(seg)}</span>
            {m != null && (
              <span className="tabular-nums text-[10px] text-muted-foreground shrink-0">
                {m}m
              </span>
            )}
          </li>
        );
      })}
      {segments.length > 30 && (
        <li className="text-[10px] text-muted-foreground italic">+ {segments.length - 30} fler segment</li>
      )}
    </ol>
  );
};

export const DiagnosticsCard: React.FC<{ diag: DiagnosticsBrief }> = ({ diag }) => {
  const rows: Array<[string, string]> = [];
  if (diag.pingCount != null) rows.push(["GPS-punkter", String(diag.pingCount)]);
  if (diag.largestGapMin != null) rows.push(["Största GPS-gap", `${diag.largestGapMin} min`]);
  if (diag.engineVersion) rows.push(["Engine", diag.engineVersion]);
  if (diag.builtAt) {
    try {
      rows.push(["Beräknad", format(new Date(diag.builtAt), "d MMM HH:mm", { locale: sv })]);
    } catch { /* noop */ }
  }
  if (diag.stale) rows.push(["Status", "Inaktuell (stale)"]);
  if (rows.length === 0 && diag.warnings.length === 0 && !diag.error) return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1.5">
      <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
        GPS / motor
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-muted-foreground">{k}</span>
              <span className="tabular-nums text-right">{v}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      {diag.warnings.length > 0 && (
        <ul className="list-disc pl-4 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
          {diag.warnings.slice(0, 6).map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
      {diag.error && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-800 dark:text-rose-300 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Time Engine kunde inte beräkna dagen.</div>
            <div className="opacity-80">{diag.error}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SubmissionExtrasCard: React.FC<{ day: WeeklyDayCell }> = ({ day }) => {
  const sub = day.submission;
  if (!sub) return null;
  const userEdits = sub.user_edits_json as any;
  const ai = sub.ai_validation_json as any;
  const aiSummary = ai?.summary ?? ai?.message ?? null;
  const aiWarnings = (ai?.warnings ?? ai?.issues ?? []) as any[];
  const hasUserEdits = Array.isArray(userEdits)
    ? userEdits.length > 0
    : !!userEdits && Object.keys(userEdits).length > 0;
  return (
    <div className="space-y-2">
      {sub.comment && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-sky-700 mb-1 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />Användarens kommentar
          </div>
          <p className="text-xs whitespace-pre-wrap">{sub.comment}</p>
        </div>
      )}
      {sub.review_comment && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-amber-800 mb-1">
            Senaste admin-svar
          </div>
          <p className="text-xs whitespace-pre-wrap">{sub.review_comment}</p>
        </div>
      )}
      {hasUserEdits && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-amber-800 mb-1 flex items-center gap-1">
            <Pencil className="h-3 w-3" />Användarredigeringar
          </div>
          <pre className="text-[10px] whitespace-pre-wrap leading-snug max-h-32 overflow-auto">
            {JSON.stringify(userEdits, null, 2)}
          </pre>
        </div>
      )}
      {(aiSummary || aiWarnings.length > 0) && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-2.5">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-orange-800 mb-1 flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />AI-validering
          </div>
          {aiSummary && <p className="text-xs mb-1">{aiSummary}</p>}
          {aiWarnings.length > 0 && (
            <ul className="text-xs list-disc pl-4 space-y-0.5">
              {aiWarnings.slice(0, 6).map((w, i) => (
                <li key={i}>{typeof w === "string" ? w : w?.message ?? JSON.stringify(w)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export const EngineProposalBanner: React.FC = () => (
  <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-2.5 flex items-start gap-2">
    <Cpu className="h-4 w-4 text-indigo-700 dark:text-indigo-300 mt-0.5 shrink-0" />
    <div>
      <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
        Förslag från GPS
      </p>
      <p className="text-[11px] text-muted-foreground">
        Väntar på att personalen granskar och skickar in. Admin kan inte godkänna ännu.
      </p>
    </div>
  </div>
);
