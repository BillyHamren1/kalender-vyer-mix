import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink, MessageSquare, Pencil, ShieldAlert } from "lucide-react";
import { format, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import type { WeeklyDayCell } from "./weeklyApprovalModel";

interface Props {
  day: WeeklyDayCell;
  staffId: string;
}

interface TimelineSegment {
  start: string;
  end: string;
  label?: string;
  type?: string;
  classification?: string;
  minutes?: number;
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

function fmtTime(iso: string | undefined): string {
  if (!iso) return "–";
  try {
    return format(new Date(iso), "HH:mm");
  } catch {
    return iso;
  }
}

export const StaffDayApprovalDetails: React.FC<Props> = ({ day, staffId }) => {
  if (!day.submission) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground italic border-t border-border/40">
        Personen har inte skickat in någon rapport för {format(parseISO(day.date), "d MMM", { locale: sv })}.
      </div>
    );
  }

  const sub = day.submission;
  const segments = extractSegments(sub.display_timeline_snapshot_json);
  const userEdits = sub.user_edits_json as any;
  const ai = sub.ai_validation_json as any;
  const aiSummary = ai?.summary ?? ai?.message ?? null;
  const aiWarnings = (ai?.warnings ?? ai?.issues ?? []) as any[];

  const gpsHref = `/staff-management/gps-satellite-map?staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(day.date)}`;

  return (
    <div className="px-4 py-3 border-t border-border/40 bg-muted/20 space-y-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timeline */}
        <div>
          <h4 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
            Tidslinje (snapshot)
          </h4>
          {segments.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Ingen snapshot sparad.</p>
          ) : (
            <ol className="space-y-1">
              {segments.slice(0, 12).map((seg, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="font-mono text-muted-foreground shrink-0 w-24">
                    {fmtTime(seg.start)} – {fmtTime(seg.end)}
                  </span>
                  <span className="truncate">
                    {seg.label || seg.classification || seg.type || "Okänd"}
                  </span>
                </li>
              ))}
              {segments.length > 12 && (
                <li className="text-[10px] text-muted-foreground italic">
                  + {segments.length - 12} fler segment
                </li>
              )}
            </ol>
          )}
        </div>

        {/* Sidopanel: kommentarer + AI */}
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
          {userEdits && (Array.isArray(userEdits) ? userEdits.length > 0 : Object.keys(userEdits).length > 0) && (
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
};

export default StaffDayApprovalDetails;
