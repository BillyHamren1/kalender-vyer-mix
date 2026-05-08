import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  MapPin,
  LogIn,
  LogOut,
  Activity,
  Truck,
  HelpCircle,
  CircleSlash,
  Play,
  Square,
  Clock,
} from "lucide-react";
import { format } from "date-fns";

interface NearestTargetCandidate {
  targetLabel: string;
  targetType: string;
  targetId: string;
  targetSource: string;
  targetValidity: string;
  timeTrackingAllowed: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  distanceMeters: number | null;
  insideRadius: boolean;
  excludedReason: string | null;
}

interface SuppressedNoiseSegment {
  id: string | null;
  type: string;
  at: string;
  endAt: string | null;
  durationMin: number | null;
  label: string;
  reason: string;
}

interface TimelineRow {
  at: string;
  endAt?: string | null;
  durationMin?: number | null;
  type:
    | "arrival"
    | "departure"
    | "signal_lost"
    | "signal_resumed"
    | "transport"
    | "unknown_place"
    | "gps_gap"
    | "active_timer_started"
    | "active_timer_stopped"
    | "smoothed_presence";
  label: string;
  targetType?: string | null;
  targetId?: string | null;
  confidence?: number | null;
  source: string;
  gpsSegmentId?: string | null;
  centerLat?: number | null;
  centerLng?: number | null;
  matchedTargetId?: string | null;
  matchedTargetType?: string | null;
  nearestTargets?: NearestTargetCandidate[];
  noMatchHint?: string | null;
  registrationId?: string | null;
  targetLabel?: string | null;
  mergedSources?: string[];
  duplicates?: Array<{ source: string; at: string; label: string; registrationId?: string | null }>;
  // smoothed_presence-only:
  startAt?: string;
  mergedSegmentIds?: string[];
  suppressedNoiseCount?: number;
  suppressedNoiseSegments?: SuppressedNoiseSegment[];
}

interface TargetMatchSummary {
  totalTargets: number;
  projectTargets: number;
  bookingTargets: number;
  warehouseTargets: number;
  locationTargets: number;
  targetsWithCoordinates: number;
  targetsMissingCoordinates: number;
  matchedTargets: number;
  unmatchedProjectTargets: number;
  excludedByReason: Record<string, number>;
  warnings: string[];
}

interface DayResponse {
  ok: boolean;
  staff: { id: string; name: string };
  date: string;
  summary: {
    lastPingAt: string | null;
    pingAgeSec: number | null;
    signal: "live" | "recent" | "stale" | "no_signal";
    hasActiveTimer: boolean;
    activeTimer: any;
    currentLabel: string;
    currentTargetType: string | null;
  };
  timeline: TimelineRow[];
  rawTimeline?: TimelineRow[];
  smoothedBlocks?: TimelineRow[];
  counts: { total: number; presenceEvents: number; timerEvents: number; gpsSegments: number; smoothedBlocks?: number; suppressedNoise?: number };
  targetMatchSummary?: TargetMatchSummary | null;
  targets?: Array<{
    id: string;
    name: string;
    type: string;
    targetSource: string;
    targetValidity: string;
    timeTrackingAllowed: boolean;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number | null;
    status: string | null;
    dateRelevance: string;
    notes: string[];
  }>;
}

const ROW_META: Record<TimelineRow["type"], { icon: any; cls: string; label: string; group: "gps" | "timer" }> = {
  arrival: { icon: LogIn, cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", label: "Anlände", group: "gps" },
  departure: { icon: LogOut, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", label: "Lämnade", group: "gps" },
  signal_lost: { icon: WifiOff, cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", label: "Signal saknas", group: "gps" },
  signal_resumed: { icon: Wifi, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30", label: "Signal åter", group: "gps" },
  transport: { icon: Truck, cls: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30", label: "Transport", group: "gps" },
  unknown_place: { icon: HelpCircle, cls: "bg-muted text-muted-foreground border-border", label: "Okänd plats", group: "gps" },
  gps_gap: { icon: CircleSlash, cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", label: "GPS-glapp (signal)", group: "gps" },
  active_timer_started: { icon: Play, cls: "bg-primary/15 text-primary border-primary/40 border-l-4 border-l-primary", label: "Timer startad", group: "timer" },
  active_timer_stopped: { icon: Square, cls: "bg-muted text-foreground border-border border-l-4 border-l-primary/60", label: "Timer stoppad", group: "timer" },
  smoothed_presence: { icon: Clock, cls: "bg-green-500/15 text-green-800 dark:text-green-300 border-green-500/40 border-l-4 border-l-green-500", label: "På känd plats", group: "gps" },
};

const SIGNAL_META = {
  live: { label: "Live", cls: "bg-green-500 text-white", icon: Wifi },
  recent: { label: "Nyligen", cls: "bg-blue-500 text-white", icon: Wifi },
  stale: { label: "Gammal", cls: "bg-yellow-500 text-black", icon: AlertTriangle },
  no_signal: { label: "Ingen signal", cls: "bg-muted text-muted-foreground", icon: WifiOff },
} as const;

const fmtTime = (iso: string) => {
  try { return format(new Date(iso), "HH:mm:ss"); } catch { return iso; }
};

export default function StaffPresenceDay() {
  const { staffId } = useParams<{ staffId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const date = searchParams.get("date") || today;

  const [data, setData] = useState<DayResponse | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    setError(null);
    // Fetch staff name directly so header always works
    supabase
      .from("staff_members")
      .select("name")
      .eq("id", staffId)
      .maybeSingle()
      .then(({ data: s }) => { if (s?.name) setStaffName(s.name); });
    try {
      const { data: resp, error: fnErr } = await supabase.functions.invoke<DayResponse>(
        "get-staff-presence-day",
        { body: { staffId, date } },
      );
      if (fnErr) throw fnErr;
      if (!resp?.ok) throw new Error((resp as any)?.error ?? "okänt fel");
      setData(resp);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [staffId, date]);

  useEffect(() => { load(); }, [load]);

  const sig = data ? SIGNAL_META[data.summary.signal] : null;
  const SigIcon = sig?.icon;

  return (
    <div className="container mx-auto p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/presence">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Tillbaka
          </Link>
        </Button>
        <Button onClick={load} disabled={loading} variant="outline" size="sm" className="ml-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Uppdatera
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">Fel: {error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-2xl">{data?.staff?.name ?? staffName ?? "—"}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Närvarologg för dagen</p>
            </div>
            {sig && SigIcon && (
              <Badge className={sig.cls}>
                <SigIcon className="h-3 w-3 mr-1" />
                {sig.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-muted-foreground">Datum:</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setSearchParams({ date: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <SummaryItem label="Senaste ping" value={data?.summary.lastPingAt ? fmtTime(data.summary.lastPingAt) : "—"} />
            <SummaryItem label="Aktuell plats" value={data?.summary.currentLabel ?? "—"} />
            <SummaryItem label="Aktiv timer" value={data?.summary.hasActiveTimer ? "Ja" : "Nej"} />
            <SummaryItem
              label="Händelser"
              value={data ? `${data.counts.total} (${data.counts.presenceEvents} presence · ${data.counts.timerEvents} timer · ${data.counts.gpsSegments} GPS)` : "—"}
            />
          </div>
        </CardContent>
      </Card>

      {data?.targetMatchSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Target matching summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <SummaryItem label="Totalt" value={String(data.targetMatchSummary.totalTargets)} />
              <SummaryItem label="Projekt" value={String(data.targetMatchSummary.projectTargets)} />
              <SummaryItem label="Bokningar" value={String(data.targetMatchSummary.bookingTargets)} />
              <SummaryItem label="Lager" value={String(data.targetMatchSummary.warehouseTargets)} />
              <SummaryItem label="Med koordinater" value={String(data.targetMatchSummary.targetsWithCoordinates)} />
              <SummaryItem label="Saknar koordinater" value={String(data.targetMatchSummary.targetsMissingCoordinates)} />
              <SummaryItem label="Matchade" value={String(data.targetMatchSummary.matchedTargets)} />
              <SummaryItem label="Omatchade projekt" value={String(data.targetMatchSummary.unmatchedProjectTargets)} />
            </div>
            {Object.keys(data.targetMatchSummary.excludedByReason).length > 0 && (
              <div className="text-xs">
                <div className="text-muted-foreground uppercase tracking-wide mb-1">Exkluderade</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(data.targetMatchSummary.excludedByReason).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-xs">{k}: {v}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.targetMatchSummary.warnings.length > 0 && (
              <div className="text-xs text-destructive">
                {data.targetMatchSummary.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Visa alla {data.targets?.length ?? 0} targets
              </summary>
              <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                {data.targets?.map((t) => (
                  <div key={`${t.type}:${t.id}`} className="flex flex-wrap items-center gap-2 p-2 rounded border border-border bg-muted/30">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{t.targetSource}</Badge>
                    <Badge variant={t.targetValidity === 'valid' ? 'default' : 'destructive'} className="text-[10px]">{t.targetValidity}</Badge>
                    {(t.latitude == null || t.longitude == null) && (
                      <Badge variant="destructive" className="text-[10px]">no coords</Badge>
                    )}
                    {t.latitude != null && (
                      <span className="text-muted-foreground">{t.latitude?.toFixed(5)}, {t.longitude?.toFixed(5)} · r={t.radiusMeters}m</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      {data && data.timeline.length > 0 && (() => {
        const rows = data.timeline;
        const gpsRows = rows.filter((r) => ROW_META[r.type].group === "gps");
        const timerRows = rows.filter((r) => ROW_META[r.type].group === "timer");
        const dayStart = rows[0]?.at ?? null;
        const gpsGapCount = rows.filter((r) => r.type === "gps_gap").length;
        const arrivalCount = rows.filter((r) => r.type === "arrival").length;
        const unknownCount = rows.filter((r) => r.type === "unknown_place").length;
        const transportCount = rows.filter((r) => r.type === "transport").length;
        const transportMin = rows
          .filter((r) => r.type === "transport")
          .reduce((s, r) => s + (r.durationMin ?? 0), 0);
        const gapMin = rows
          .filter((r) => r.type === "gps_gap")
          .reduce((s, r) => s + (r.durationMin ?? 0), 0);
        // Active timer periods: pair starts with stops (by registrationId)
        const startsById = new Map<string, string>();
        for (const r of timerRows) {
          if (r.type === "active_timer_started" && r.registrationId) startsById.set(r.registrationId, r.at);
        }
        const periods: Array<{ start: string; end: string | null; min: number | null }> = [];
        for (const r of timerRows) {
          if (r.type === "active_timer_started" && r.registrationId) {
            periods.push({ start: r.at, end: null, min: null });
          } else if (r.type === "active_timer_stopped" && r.registrationId) {
            const startAt = startsById.get(r.registrationId);
            if (startAt) {
              const min = Math.round((new Date(r.at).getTime() - new Date(startAt).getTime()) / 60000);
              const open = periods.find((p) => p.start === startAt && p.end == null);
              if (open) { open.end = r.at; open.min = min; }
            }
          }
        }
        const timerMin = periods.reduce((s, p) => s + (p.min ?? 0), 0);

        return (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Dagens sammanfattning
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <SummaryItem label="Start på dagen" value={dayStart ? fmtTime(dayStart) : "—"} />
                  <SummaryItem label="Senaste ping" value={data.summary.lastPingAt ? fmtTime(data.summary.lastPingAt) : "—"} />
                  <SummaryItem label="Kända platser" value={String(arrivalCount)} />
                  <SummaryItem label="Okända platser" value={String(unknownCount)} />
                  <SummaryItem label="Transport" value={transportCount > 0 ? `${transportCount} st (${transportMin} min)` : "0"} />
                  <SummaryItem label="GPS-glapp" value={gpsGapCount > 0 ? `${gpsGapCount} st (${gapMin} min)` : "0"} />
                  <SummaryItem label="Timerperioder" value={periods.length > 0 ? `${periods.length} st (${timerMin} min)` : "0"} />
                  <SummaryItem label="Aktiv timer nu" value={data.summary.hasActiveTimer ? "Ja" : "Nej"} />
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  GPS-glapp är signalstatus, inte arbetstid — personen kan ha varit kvar på samma plats utan ping.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" /> Närvaro & GPS
                  <Badge variant="outline" className="ml-2 text-xs">{gpsRows.length}</Badge>
                  {(data.smoothedBlocks?.length ?? 0) > 0 && !showRaw && (
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {data.smoothedBlocks!.length} sammanhängande block
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    onClick={() => setShowRaw((v) => !v)}
                  >
                    {showRaw ? "Visa sammanhängande" : "Visa rå GPS-segment"}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {gpsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga GPS-händelser för dagen.</p>
                ) : (
                  <div className="space-y-2">
                    {(showRaw
                      ? (data.rawTimeline ?? data.timeline).filter((r) => ROW_META[r.type]?.group === "gps")
                      : gpsRows
                    ).map((row, i) => <TimelineRowView key={`g${i}`} row={row} />)}
                  </div>
                )}
                {!showRaw && (data.summary as any)?.smoothing && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Smoothing: {(data.summary as any).smoothing.blocksCount} block ·
                    {" "}{(data.summary as any).smoothing.suppressedNoiseCount} brus-segment dolda ·
                    {" "}{(data.summary as any).smoothing.mergedArrivals} dubbletter av samma plats infogade.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Play className="h-5 w-5 text-primary" /> Timer-händelser
                  <Badge variant="outline" className="ml-2 text-xs">{timerRows.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {timerRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga timer-händelser för dagen.</p>
                ) : (
                  <div className="space-y-2">
                    {timerRows.map((row, i) => <TimelineRowView key={`t${i}`} row={row} />)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Timer-händelser visar registrerad arbetstid — inte fysisk plats. Stäms av mot GPS ovan.
                </p>
              </CardContent>
            </Card>
          </>
        );
      })()}

      {!loading && data && data.timeline.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">Inga händelser för det här datumet.</p>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">Laddar…</p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Detta är närvarologg från GPS och Time Engine. Inga time_reports, workdays, location_time_entries
        eller travel_time_logs skapas eller läses.
      </p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-medium truncate" title={value}>{value}</div>
    </div>
  );
}

function TimelineRowView({ row }: { row: TimelineRow }) {
  const meta = ROW_META[row.type];
  const Icon = meta.icon;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-md border ${meta.cls}`}>
      <Icon className="h-4 w-4 mt-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-semibold tabular-nums">{fmtTime(row.at)}</span>
          {row.endAt && (
            <span className="text-xs text-muted-foreground">→ {fmtTime(row.endAt)}{row.durationMin != null && ` (${row.durationMin} min)`}</span>
          )}
          <span className="text-xs uppercase tracking-wide opacity-70">
            {meta.group === "timer" ? `Timer · ${meta.label}` : meta.label}
          </span>
        </div>
        <div className="text-sm mt-0.5 truncate">{row.label}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
          {row.targetType && <span>typ: {row.targetType}</span>}
          {row.confidence != null && <span>conf: {Math.round(Number(row.confidence) * 100)}%</span>}
          <span>källa: {row.source}</span>
          {row.mergedSources && row.mergedSources.length > 1 && (
            <Badge variant="outline" className="text-[10px]">
              +{row.mergedSources.length - 1} källa{row.mergedSources.length - 1 === 1 ? '' : 'r'}
            </Badge>
          )}
          {row.registrationId && <span>reg: {row.registrationId.slice(0, 8)}…</span>}
          {row.gpsSegmentId && <span>seg: {row.gpsSegmentId}</span>}
          {row.centerLat != null && row.centerLng != null && (
            <span>@ {row.centerLat.toFixed(5)}, {row.centerLng.toFixed(5)}</span>
          )}
        </div>
        {row.duplicates && row.duplicates.length > 0 && (
          <details className="text-xs mt-1">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Dolda dubbletter ({row.duplicates.length})
            </summary>
            <div className="mt-1 space-y-1 pl-2 border-l border-border">
              {row.duplicates.map((d, di) => (
                <div key={di} className="text-muted-foreground">
                  {fmtTime(d.at)} · källa: {d.source}
                  {d.registrationId && ` · reg: ${d.registrationId.slice(0, 8)}…`}
                  {d.label && d.label !== row.label && ` · ${d.label}`}
                </div>
              ))}
            </div>
          </details>
        )}
        {row.suppressedNoiseSegments && row.suppressedNoiseSegments.length > 0 && (
          <details className="text-xs mt-1">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Dolda brus-segment ({row.suppressedNoiseSegments.length})
            </summary>
            <div className="mt-1 space-y-1 pl-2 border-l border-border">
              {row.suppressedNoiseSegments.map((s, si) => (
                <div key={si} className="text-muted-foreground">
                  {fmtTime(s.at)}{s.endAt ? ` → ${fmtTime(s.endAt)}` : ""}
                  {s.durationMin != null && ` (${s.durationMin} min)`}
                  · {s.type} · {s.reason}
                  {s.id && ` · seg: ${s.id}`}
                </div>
              ))}
            </div>
          </details>
        )}
        {row.noMatchHint && (
          <div className="text-xs mt-1 px-2 py-1 rounded bg-destructive/10 text-destructive border border-destructive/30">
            ⚠ {row.noMatchHint}
          </div>
        )}
        {row.nearestTargets && row.nearestTargets.length > 0 && (
          <details className="text-xs mt-2">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Närmaste targets ({row.nearestTargets.length})
            </summary>
            <div className="mt-1 space-y-1">
              {row.nearestTargets.map((c) => (
                <div key={c.targetId} className={`p-2 rounded border ${c.insideRadius ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-muted/30'}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{c.targetLabel}</span>
                    <Badge variant="outline" className="text-[10px]">{c.targetType}</Badge>
                    <Badge variant="outline" className="text-[10px]">{c.targetSource}</Badge>
                    <Badge variant={c.targetValidity === 'valid' ? 'default' : 'destructive'} className="text-[10px]">{c.targetValidity}</Badge>
                    {c.insideRadius && <Badge className="text-[10px] bg-green-600">inside</Badge>}
                    {c.excludedReason && <Badge variant="destructive" className="text-[10px]">{c.excludedReason}</Badge>}
                  </div>
                  <div className="mt-1 text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    {c.distanceMeters != null ? <span>avstånd: {c.distanceMeters} m</span> : <span>avstånd: —</span>}
                    <span>radius: {c.radiusMeters ?? '—'} m</span>
                    {c.lat != null && c.lng != null
                      ? <span>{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</span>
                      : <span>koordinater saknas</span>}
                    <span>id: {c.targetId.slice(0, 8)}…</span>
                    <span>tracking: {c.timeTrackingAllowed ? 'ja' : 'nej'}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
