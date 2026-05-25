import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, MessageSquare, Pencil, ShieldAlert, Cpu, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import type { WeeklyDayCell } from "./weeklyApprovalModel";

interface Props {
  day: WeeklyDayCell;
  staffId: string;
}

interface TimelineSegment {
  start?: string;
  end?: string;
  startedAt?: string;
  endedAt?: string;
  start_time?: string;
  end_time?: string;
  label?: string;
  type?: string;
  classification?: string;
  minutes?: number;
  durationMinutes?: number;
}

function extractSegments(snapshot: unknown): TimelineSegment[] {
  if (!snapshot) return [];
  if (Array.isArray(snapshot)) return snapshot as TimelineSegment[];
  const obj = snapshot as any;
  const candidate =
    obj?.segments ??
    obj?.timeline ??
    obj?.blocks ??
    obj?.display_segments ??
    obj?.events;
  if (Array.isArray(candidate)) return candidate as TimelineSegment[];
  return [];
}

function fmtTime(value: string | undefined): string {
  if (!value) return "–";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  try {
    return format(new Date(value), "HH:mm");
  } catch {
    return value;
  }
}

function segStart(s: TimelineSegment): string | undefined {
  return s.start ?? s.startedAt ?? (s as any).started_at ?? s.start_time ?? (s as any).startTime;
}
function segEnd(s: TimelineSegment): string | undefined {
  return s.end ?? s.endedAt ?? (s as any).ended_at ?? s.end_time ?? (s as any).endTime;
}
function segLabel(s: TimelineSegment): string {
  return s.label || s.classification || s.type || "Okänd";
}

function SegmentList({ segments }: { segments: TimelineSegment[] }) {
  if (segments.length === 0) {
    return <p className="text-xs italic text-muted-foreground">Inga segment.</p>;
  }
  return (
    <ol className="space-y-1">
      {segments.slice(0, 12).map((seg, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span className="font-mono text-muted-foreground shrink-0 w-24">
            {fmtTime(segStart(seg))} – {fmtTime(segEnd(seg))}
          </span>
          <span className="truncate">{segLabel(seg)}</span>
        </li>
      ))}
      {segments.length > 12 && (
        <li className="text-[10px] text-muted-foreground italic">
          + {segments.length - 12} fler segment
        </li>
      )}
    </ol>
  );
}

function CacheSummary({ summary }: { summary: any }) {
  if (!summary || typeof summary !== "object") return null;
  const rows: Array<{ k: string; v: number | string }> = [];
  const push = (label: string, raw: any) => {
    if (typeof raw === "number" && isFinite(raw) && raw > 0) rows.push({ k: label, v: raw });
  };
  push("Arbete (min)", summary.workMinutes);
  push("Lönegrund (min)", summary.payableMinutes);
  push("Totalt (min)", summary.totalMinutes);
  push("Transport (min)", summary.transportMinutes);
  push("Rast (min)", summary.breakMinutes);
  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
      {rows.map((r) => (
        <React.Fragment key={r.k}>
          <span className="text-muted-foreground">{r.k}</span>
          <span className="tabular-nums text-right">{r.v}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

export const StaffDayApprovalDetails: React.FC<Props> = ({ day, staffId }) => {
  const gpsHref = `/staff-management/gps-satellite-map?staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(day.date)}`;

  // Engine error
  if (day.uiStatus === "engine_error" && day.cache) {
    const diag = day.cache.diagnostics_json as any;
    return (
      <div className="px-4 py-3 border-t border-border/40 bg-rose-500/5 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-rose-800 dark:text-rose-300">
              Time Engine kunde inte beräkna denna dag.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{day.cache.error}</p>
          </div>
        </div>
        {diag && (
          <pre className="text-[10px] whitespace-pre-wrap leading-snug bg-background/60 rounded p-2 max-h-40 overflow-auto">
            {JSON.stringify(diag, null, 2)}
          </pre>
        )}
        <div className="flex items-center justify-end">
          <Link
            to={gpsHref}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Öppna GPS satellitkarta
          </Link>
        </div>
      </div>
    );
  }

  // No data
  if (day.source === "none") {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground italic border-t border-border/40 flex items-center justify-between">
        <span>
          Inget underlag för {format(parseISO(day.date), "d MMM", { locale: sv })} —
          varken rapport eller GPS-förslag.
        </span>
        <Link
          to={gpsHref}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          GPS
        </Link>
      </div>
    );
  }

  // Submission finns → submission vinner; cache fallback för snapshot.
  if (day.submission) {
    const sub = day.submission;
    const subSegments = extractSegments(sub.display_timeline_snapshot_json);
    const fallbackSegments =
      subSegments.length === 0 && day.cache
        ? extractSegments(day.cache.display_blocks_json)
        : [];
    const segments = subSegments.length > 0 ? subSegments : fallbackSegments;

    const userEdits = sub.user_edits_json as any;
    const ai = sub.ai_validation_json as any;
    const aiSummary = ai?.summary ?? ai?.message ?? null;
    const aiWarnings = (ai?.warnings ?? ai?.issues ?? []) as any[];

    return (
      <div className="px-4 py-3 border-t border-border/40 bg-muted/20 space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
              Tidslinje {subSegments.length === 0 && fallbackSegments.length > 0 ? "(från Time Engine-cache)" : "(snapshot)"}
            </h4>
            <SegmentList segments={segments} />
          </div>
          <div className="space-y-3">
            {sub.comment && (
              <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5">
                <div className="text-[10px] uppercase font-semibold tracking-wider text-sky-700 mb-1 flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Användarens kommentar
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
                {sub.reviewed_at && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(sub.reviewed_at), "d MMM yyyy HH:mm", { locale: sv })}
                  </p>
                )}
              </div>
            )}
            {userEdits &&
              (Array.isArray(userEdits) ? userEdits.length > 0 : Object.keys(userEdits).length > 0) && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                  <div className="text-[10px] uppercase font-semibold tracking-wider text-amber-800 mb-1 flex items-center gap-1">
                    <Pencil className="h-3 w-3" />
                    Användarredigeringar
                  </div>
                  <pre className="text-[10px] whitespace-pre-wrap leading-snug text-foreground/80 max-h-40 overflow-auto">
                    {JSON.stringify(userEdits, null, 2)}
                  </pre>
                </div>
              )}
            {(aiSummary || aiWarnings.length > 0) && (
              <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-2.5">
                <div className="text-[10px] uppercase font-semibold tracking-wider text-orange-800 mb-1 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  AI-validering
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
        </div>

        <div className="flex items-center justify-end">
          <Link
            to={gpsHref}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Öppna GPS satellitkarta
          </Link>
        </div>
      </div>
    );
  }

  // Engine cache utan submission
  const cache = day.cache!;
  let segments = extractSegments(cache.display_blocks_json);
  if (segments.length === 0) {
    segments = extractSegments(cache.report_candidate_blocks_json);
  }
  const summary = cache.summary_json as any;

  return (
    <div className="px-4 py-3 border-t border-border/40 bg-indigo-500/5 space-y-3 text-sm">
      <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-2.5 flex items-start gap-2">
        <Cpu className="h-4 w-4 text-indigo-700 dark:text-indigo-300 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
            Förslag från Time Engine / GPS-satellit
          </p>
          <p className="text-[11px] text-muted-foreground">
            Väntar på att personalen granskar och skickar in.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
            Föreslagen tidslinje
          </h4>
          <SegmentList segments={segments} />
        </div>
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
            Sammanfattning
          </h4>
          <CacheSummary summary={summary} />
          {cache.built_at && (
            <p className="text-[10px] text-muted-foreground">
              Beräknad {format(new Date(cache.built_at), "d MMM yyyy HH:mm", { locale: sv })}
              {cache.stale ? " · stale" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Link
          to={gpsHref}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Öppna GPS satellitkarta
        </Link>
      </div>
    </div>
  );
};

export default StaffDayApprovalDetails;
