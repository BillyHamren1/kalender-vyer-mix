import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDayTimeline, type DayTimelineSuggestion } from "@/hooks/admin/useDayTimeline";
import { SuggestionActionButtons } from "./SuggestionActionButtons";

interface Props {
  staffId: string;
  date: string;
  organizationId: string | null;
}

const TYPE_TITLES: Record<string, string> = {
  shorten_end: "Korta sluttid",
  extend_end: "Förläng sluttid",
  shorten_start: "Senarelägg starttid",
  extend_start: "Tidigarelägg starttid",
  mark_as_unclear: "Tiden behöver verifieras",
  phantom_end: "Inget besök på platsen",
  missing_arrival: "Saknad ankomst",
  late_arrival: "Sen ankomst",
  early_leave: "Tidig avgång",
};

function titleFor(type: string) {
  return TYPE_TITLES[type] ?? type;
}

function formatTime(t: string | null | undefined) {
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function formatDiff(min: number | null) {
  if (min == null) return "";
  const sign = min > 0 ? "−" : "+";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60); const m = abs % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

export function CorrectionSuggestionsPanel({ staffId, date, organizationId }: Props) {
  const { suggestions } = useDayTimeline({ staffId, date });
  const pending = suggestions.filter((s) => s.status === "pending");
  if (pending.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <header className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold text-destructive">
          {pending.length === 1
            ? "1 förslag behöver hanteras"
            : `${pending.length} förslag behöver hanteras`}
        </h3>
      </header>

      <ul className="space-y-3">
        {pending.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} staffId={staffId} date={date} organizationId={organizationId} />
        ))}
      </ul>
    </section>
  );
}

function SuggestionCard({
  suggestion: s, staffId, date, organizationId,
}: {
  suggestion: DayTimelineSuggestion;
  staffId: string;
  date: string;
  organizationId: string | null;
}) {
  const lowConf = s.confidence != null && s.confidence < 0.7;
  return (
    <li className="rounded-md bg-card border border-border/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">{titleFor(s.suggestion_type)}</div>
          {s.human_readable_text && (
            <p className="text-xs text-muted-foreground">{s.human_readable_text}</p>
          )}
        </div>
        <Badge variant="outline" className={lowConf ? "border-destructive/30 text-destructive" : "border-border/60 text-muted-foreground"}>
          {Math.round((s.confidence ?? 0) * 100)}% säkerhet
        </Badge>
      </div>

      {(s.original_end_time || s.suggested_end_time || s.original_start_time || s.suggested_start_time) && (
        <div className="text-xs grid grid-cols-3 gap-2 bg-muted/40 rounded px-2 py-1.5">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Ursprung</div>
            <div className="tabular-nums">
              {formatTime(s.original_start_time)} – {formatTime(s.original_end_time)}
            </div>
          </div>
          <div className="flex items-center justify-center text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Förslag</div>
            <div className="tabular-nums">
              {formatTime(s.suggested_start_time)} – {formatTime(s.suggested_end_time)}
              {s.difference_min != null && (
                <span className="ml-1 text-muted-foreground">({formatDiff(s.difference_min)})</span>
              )}
            </div>
          </div>
        </div>
      )}

      <SuggestionActionButtons
        suggestionId={s.id}
        staffId={staffId}
        date={date}
        organizationId={organizationId}
      />
    </li>
  );
}

export default CorrectionSuggestionsPanel;
