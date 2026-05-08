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
    | "active_timer_stopped";
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
  counts: { total: number; presenceEvents: number; timerEvents: number; gpsSegments: number };
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

const ROW_META: Record<TimelineRow["type"], { icon: any; cls: string; label: string }> = {
  arrival: { icon: LogIn, cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", label: "Anlände" },
  departure: { icon: LogOut, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", label: "Lämnade" },
  signal_lost: { icon: WifiOff, cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30", label: "Signal saknas" },
  signal_resumed: { icon: Wifi, cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30", label: "Signal åter" },
  transport: { icon: Truck, cls: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30", label: "Transport" },
  unknown_place: { icon: HelpCircle, cls: "bg-muted text-muted-foreground border-border", label: "Okänd plats" },
  gps_gap: { icon: CircleSlash, cls: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30", label: "GPS-glapp" },
  active_timer_started: { icon: Play, cls: "bg-primary/15 text-primary border-primary/30", label: "Timer startad" },
  active_timer_stopped: { icon: Square, cls: "bg-muted text-foreground border-border", label: "Timer stoppad" },
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Tidslinje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">Laddar…</p>}
          {!loading && data && data.timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">Inga händelser för det här datumet.</p>
          )}
          {!loading && data && data.timeline.length > 0 && (
            <div className="space-y-2">
              {data.timeline.map((row, i) => {
                const meta = ROW_META[row.type];
                const Icon = meta.icon;
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-md border ${meta.cls}`}>
                    <Icon className="h-4 w-4 mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono font-semibold tabular-nums">{fmtTime(row.at)}</span>
                        {row.endAt && (
                          <span className="text-xs text-muted-foreground">→ {fmtTime(row.endAt)}{row.durationMin != null && ` (${row.durationMin} min)`}</span>
                        )}
                        <span className="text-xs uppercase tracking-wide opacity-70">{meta.label}</span>
                      </div>
                      <div className="text-sm mt-0.5 truncate">{row.label}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        {row.targetType && <span>typ: {row.targetType}</span>}
                        {row.confidence != null && <span>conf: {Math.round(Number(row.confidence) * 100)}%</span>}
                        <span>källa: {row.source}</span>
                        {row.gpsSegmentId && <span>seg: {row.gpsSegmentId}</span>}
                        {row.centerLat != null && row.centerLng != null && (
                          <span>@ {row.centerLat.toFixed(5)}, {row.centerLng.toFixed(5)}</span>
                        )}
                      </div>
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
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
