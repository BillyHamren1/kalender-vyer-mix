import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Sunrise, Sunset, Play, Square, MapPin, LogIn, LogOut,
  HelpCircle, Footprints, AlertTriangle, WifiOff, Clock, Car, Pause,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DayTimelineEvent } from "@/hooks/admin/useDayTimeline";

interface Props {
  event: DayTimelineEvent;
  selected?: boolean;
  onSelect?: (eventId: string) => void;
}

type Tone = "primary" | "muted" | "destructive" | "accent";

const META: Record<string, { Icon: React.ComponentType<{ className?: string }>; tone: Tone; label: string }> = {
  workday_started:           { Icon: Sunrise,       tone: "primary",     label: "Arbetsdag startad" },
  workday_ended:             { Icon: Sunset,        tone: "primary",     label: "Arbetsdag avslutad" },
  timer_started:             { Icon: Play,          tone: "primary",     label: "Timer startad" },
  timer_stopped:             { Icon: Square,        tone: "primary",     label: "Timer stoppad" },
  stay_segment:              { Icon: Pause,         tone: "accent",      label: "Stannade" },
  travel_segment:            { Icon: Car,           tone: "muted",       label: "Resa" },
  arrived_at_reported_site:  { Icon: LogIn,         tone: "muted",       label: "Anlände till plats" },
  left_reported_site:        { Icon: LogOut,        tone: "muted",       label: "Lämnade plats" },
  arrived_at_known_location: { Icon: LogIn,         tone: "muted",       label: "Anlände till känd plats" },
  left_known_location:       { Icon: LogOut,        tone: "muted",       label: "Lämnade känd plats" },
  stopped_at_unknown_location:{ Icon: MapPin,       tone: "muted",       label: "Stopp på okänd plats" },
  movement_started:          { Icon: Footprints,    tone: "muted",       label: "Förflyttning startad" },
  movement_ended:            { Icon: Footprints,    tone: "muted",       label: "Förflyttning slutade" },
  gps_gap_started:           { Icon: WifiOff,       tone: "destructive", label: "GPS-glapp" },
  gps_gap_ended:             { Icon: WifiOff,       tone: "destructive", label: "GPS-glapp slutade" },
  stale_phone_detected:      { Icon: AlertTriangle, tone: "destructive", label: "Telefon ej aktiv" },
  geofence_mismatch:         { Icon: AlertTriangle, tone: "destructive", label: "Geofence avvek" },
  ongoing_at_last_known:     { Icon: Clock,         tone: "primary",     label: "Pågår vid senaste kända plats" },
};

function metaFor(type: string) {
  return META[type] ?? { Icon: HelpCircle, tone: "muted" as Tone, label: type };
}

function toneClasses(tone: Tone) {
  if (tone === "destructive") return { dot: "bg-destructive/15 text-destructive ring-destructive/30", text: "text-destructive" };
  if (tone === "primary") return { dot: "bg-primary/15 text-primary ring-primary/30", text: "text-foreground" };
  if (tone === "accent") return { dot: "bg-accent text-accent-foreground ring-accent/40", text: "text-foreground" };
  return { dot: "bg-muted text-muted-foreground ring-border", text: "text-muted-foreground" };
}

export function DayTimelineEventRow({ event, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const m = metaFor(event.event_type);
  const tones = toneClasses(m.tone);
  const time = (() => {
    try { return format(parseISO(event.ts), "HH:mm"); } catch { return "--:--"; }
  })();
  const lowConfidence = event.confidence != null && event.confidence < 0.7;
  const expandable =
    event.lat != null || event.lng != null || event.accuracy != null ||
    event.matched_site_name != null || event.distance_to_reported_site_m != null ||
    event.source != null;

  return (
    <li className="relative pl-9">
      {/* dot on rail */}
      <span
        className={cn(
          "absolute left-1.5 top-1 h-5 w-5 rounded-full ring-2 flex items-center justify-center",
          tones.dot,
        )}
        aria-hidden
      >
        <m.Icon className="h-3 w-3" />
      </span>

      <button
        type="button"
        onClick={() => {
          onSelect?.(event.id);
          if (expandable) setOpen((o) => !o);
        }}
        className={cn(
          "w-full text-left rounded-md px-2 py-1.5 -ml-2 hover:bg-accent/40 transition-colors",
          expandable ? "cursor-pointer" : "cursor-default",
          selected && "bg-accent ring-1 ring-primary/40",
        )}
        aria-expanded={open}
        aria-selected={selected}
      >
        <div className="flex items-start gap-2 flex-wrap">
          <span className="tabular-nums text-xs text-muted-foreground w-10 shrink-0 mt-0.5">{time}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-sm font-medium", tones.text)}>
                {event.human_readable_text || m.label}
              </span>
              {lowConfidence && (
                <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                  Låg säkerhet {Math.round((event.confidence ?? 0) * 100)}%
                </Badge>
              )}
              {expandable && (
                open
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            {event.matched_site_name && (
              <div className="text-xs text-muted-foreground truncate">
                <MapPin className="inline h-3 w-3 mr-1 -mt-0.5" />
                {event.matched_site_name}
              </div>
            )}
          </div>
        </div>

        {open && expandable && (
          <dl className="mt-2 ml-12 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {event.lat != null && event.lng != null && (
              <>
                <dt>Position</dt>
                <dd className="tabular-nums">
                  <a
                    href={`https://www.google.com/maps?q=${event.lat},${event.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-primary hover:underline"
                  >
                    {event.lat.toFixed(5)}, {event.lng.toFixed(5)}
                  </a>
                </dd>
              </>
            )}
            {event.accuracy != null && (<><dt>GPS-noggrannhet</dt><dd>±{Math.round(event.accuracy)} m</dd></>)}
            {event.source && (<><dt>Källa</dt><dd>{event.source}</dd></>)}
            {event.matched_site_name && (<><dt>Matchad plats</dt><dd className="truncate">{event.matched_site_name}</dd></>)}
            {event.distance_to_reported_site_m != null && (
              <><dt>Avstånd till rapporterad plats</dt><dd>{Math.round(event.distance_to_reported_site_m)} m</dd></>
            )}
            {event.confidence != null && (<><dt>Säkerhet</dt><dd>{Math.round(event.confidence * 100)}%</dd></>)}
          </dl>
        )}
      </button>
    </li>
  );
}

export default DayTimelineEventRow;
