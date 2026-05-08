import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  MapPin,
  Activity,
  AlertTriangle,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronRight,
  LogIn,
  LogOut,
  Users,
  CalendarDays,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { sv } from "date-fns/locale";

type Signal = "live" | "recent" | "stale" | "no_signal";
type Interpreted = "på event" | "på lager" | "transport" | "okänd plats" | "GPS-glapp";

interface PresenceRow {
  staffId: string;
  name: string;
  lastPingAt: string | null;
  pingAgeSec: number | null;
  signal: Signal;
  interpretedStatus: Interpreted;
  targetLabel: string;
  matchedTarget: {
    kind: "warehouse" | "project" | "large_project";
    id: string;
    label: string;
    distanceMeters: number;
  } | null;
  arrival: { at: string; targetLabel: string | null; targetType: string; stillOnSite: boolean } | null;
  departure: { at: string; targetLabel: string | null; targetType: string; isLatest: boolean } | null;
  activeTimer:
    | { active: false }
    | {
        active: true;
        id: string;
        startedAt: string;
        startSource: string | null;
        currentLabel: string | null;
        currentKind: string | null;
        autoStarted: boolean;
      };
}

type TStatus = "on_site" | "left" | "transport" | "unknown_place" | "no_signal";
interface TargetRoster {
  staffId: string;
  name: string;
  status: TStatus;
  arrivedAt: string | null;
  departedAt: string | null;
  lastPingAt: string | null;
  signalAgeMinutes: number | null;
  confidence: number | null;
  hasActiveTimer: boolean;
  activeTimer: {
    startedAt: string;
    currentLabel: string | null;
    startSource: string | null;
    autoStarted: boolean;
  } | null;
}
interface TargetHistory {
  id: string;
  staffId: string;
  staffName: string;
  eventType: "arrival" | "departure";
  eventAt: string;
  targetLabel: string | null;
  confidence: number | null;
  isFocusedTarget: boolean;
}
interface TargetPresenceData {
  roster: TargetRoster[];
  history: TargetHistory[];
}

const signalVariant = (s: Signal): { label: string; cls: string; icon: any } => {
  switch (s) {
    case "live": return { label: "Live", cls: "bg-green-500 text-white", icon: Wifi };
    case "recent": return { label: "Nyligen", cls: "bg-blue-500 text-white", icon: Wifi };
    case "stale": return { label: "Gammal", cls: "bg-yellow-500 text-black", icon: AlertTriangle };
    case "no_signal": return { label: "Ingen signal", cls: "bg-muted text-muted-foreground", icon: WifiOff };
  }
};

const interpretedVariant = (s: Interpreted): string => {
  switch (s) {
    case "på event": return "bg-primary text-primary-foreground";
    case "på lager": return "bg-amber-500 text-white";
    case "transport": return "bg-cyan-500 text-white";
    case "GPS-glapp": return "bg-destructive text-destructive-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

const T_STATUS: Record<TStatus, { label: string; cls: string }> = {
  on_site: { label: "På plats", cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" },
  left: { label: "Lämnat", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  transport: { label: "Transport", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  unknown_place: { label: "Okänd plats", cls: "bg-muted text-muted-foreground border-border" },
  no_signal: { label: "Signal saknas", cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
};

const KIND_LABEL: Record<string, string> = {
  warehouse: "Lager",
  project: "Projekt",
  large_project: "Stort projekt",
};

const fmtTime = (iso: string | null) => (iso ? format(new Date(iso), "HH:mm") : "—");

export default function PresenceHub() {
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("get-staff-presence", { body: {} });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error || "unknown_error");
      setRows((data as any).presence ?? []);
      setGeneratedAt((data as any).generatedAt ?? null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 15000);
    return () => window.clearInterval(id);
  }, [fetchData]);

  // Derive distinct targets from staff presence
  const targets = useMemo(() => {
    const map = new Map<
      string,
      {
        kind: string;
        id: string;
        label: string;
        onSite: PresenceRow[];
        recentlyLeft: PresenceRow[];
      }
    >();
    for (const r of rows) {
      // Currently on-site (matched target)
      if (r.matchedTarget) {
        const key = `${r.matchedTarget.kind}:${r.matchedTarget.id}`;
        if (!map.has(key)) {
          map.set(key, {
            kind: r.matchedTarget.kind,
            id: r.matchedTarget.id,
            label: r.matchedTarget.label,
            onSite: [],
            recentlyLeft: [],
          });
        }
        map.get(key)!.onSite.push(r);
      } else if (r.departure?.isLatest && r.departure.targetLabel) {
        // Recently left a target
        const key = `${r.departure.targetType}:${r.departure.targetLabel}`;
        if (!map.has(key)) {
          map.set(key, {
            kind: r.departure.targetType,
            id: key,
            label: r.departure.targetLabel,
            onSite: [],
            recentlyLeft: [],
          });
        }
        map.get(key)!.recentlyLeft.push(r);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.onSite.length - a.onSite.length || a.label.localeCompare(b.label),
    );
  }, [rows]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Närvaro
          </h1>
          <p className="text-sm text-muted-foreground">
            Var är personalen just nu? Vilka är på respektive event/lager/projekt? Drivs av Time
            Engine / GPS — läser inte workdays, time_reports, LTE eller travel.
          </p>
          {generatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Uppdaterad {formatDistanceToNow(new Date(generatedAt), { locale: sv, addSuffix: true })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={async () => {
              const dryRun = !confirm("Backfilla koordinater för ALLA bokningar/projekt utan koordinater?\n\nOK = kör skarpt, Avbryt = endast förhandsgranska");
              const { data, error } = await supabase.functions.invoke("backfill-coords", {
                body: { dryRun, limit: 500 },
              });
              if (error) { alert("Fel: " + error.message); return; }
              const c = (data as any)?.counts ?? {};
              alert(
                `${dryRun ? "Förhandsgranskning" : "Backfill klar"}\n` +
                `Geokodade: ${c.geocoded ?? 0}\n` +
                `Uppdaterade: ${c.updated ?? 0}\n` +
                `Geokodning misslyckades: ${c.geocodeFailed ?? 0}\n` +
                `Hoppade över (saknar adress): ${c.skipped ?? 0}`
              );
            }}
            variant="outline"
            size="sm"
          >
            <MapPin className="h-4 w-4 mr-2" />
            Backfilla koordinater
          </Button>
          <Button onClick={fetchData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">Fel: {error}</CardContent>
        </Card>
      )}

      <Tabs defaultValue="day" className="w-full">
        <TabsList>
          <TabsTrigger value="day">
            <CalendarDays className="h-4 w-4 mr-2" />
            Dagöversikt
          </TabsTrigger>
          <TabsTrigger value="staff">
            <Users className="h-4 w-4 mr-2" />
            Personal ({rows.length})
          </TabsTrigger>
          <TabsTrigger value="targets">
            <MapPin className="h-4 w-4 mr-2" />
            Platser ({targets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="mt-4">
          <PresenceDayOverview />
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {rows.map((r) => {
              const sig = signalVariant(r.signal);
              const SigIcon = sig.icon;
              return (
                <Card key={r.staffId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base truncate">{r.name}</CardTitle>
                      <Badge className={sig.cls}>
                        <SigIcon className="h-3 w-3 mr-1" />
                        {sig.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Badge className={interpretedVariant(r.interpretedStatus)}>
                      {r.interpretedStatus}
                    </Badge>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate text-foreground">{r.targetLabel}</div>
                        {r.matchedTarget && (
                          <div className="text-xs">
                            {KIND_LABEL[r.matchedTarget.kind] ?? r.matchedTarget.kind} ·{" "}
                            {r.matchedTarget.distanceMeters} m
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Senaste ping:{" "}
                      {r.lastPingAt
                        ? formatDistanceToNow(new Date(r.lastPingAt), { locale: sv, addSuffix: true })
                        : "—"}
                    </div>
                    {(r.arrival?.stillOnSite || r.departure?.isLatest) && (
                      <div className="text-xs space-y-0.5 pt-1 border-t">
                        {r.arrival?.stillOnSite && (
                          <div>
                            <span className="text-muted-foreground">Anlände:</span>{" "}
                            <span className="font-medium">{fmtTime(r.arrival.at)}</span>{" "}
                            <span className="text-muted-foreground">{r.arrival.targetLabel ?? ""}</span>
                          </div>
                        )}
                        {r.departure?.isLatest && (
                          <div>
                            <span className="text-muted-foreground">Lämnade:</span>{" "}
                            <span className="font-medium">{fmtTime(r.departure.at)}</span>{" "}
                            <span className="text-muted-foreground">{r.departure.targetLabel ?? ""}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      {r.activeTimer.active ? (
                        <div className="flex-1 min-w-0">
                          <div className="text-xs">
                            <span className="font-semibold text-foreground">Aktiv timer</span>
                            {r.activeTimer.autoStarted && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">auto</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.activeTimer.currentLabel ?? "—"} · {r.activeTimer.startSource ?? "?"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Ingen aktiv timer</span>
                      )}
                    </div>
                    <Button asChild variant="outline" size="sm" className="w-full mt-1">
                      <Link to={`/admin/presence/staff/${r.staffId}?date=${new Date().toISOString().slice(0, 10)}`}>
                        <CalendarDays className="h-4 w-4 mr-2" />
                        Visa dag
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {!loading && rows.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Ingen aktiv personal hittades.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="targets" className="mt-4 space-y-2">
          {targets.length === 0 && !loading && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Inga aktiva platser just nu.
              </CardContent>
            </Card>
          )}
          {targets.map((t) => (
            <TargetCard key={`${t.kind}:${t.id}`} kind={t.kind} id={t.id} label={t.label} onSite={t.onSite} recentlyLeft={t.recentlyLeft} />
          ))}
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground pt-2">
        Detta är närvarologg, inte tidrapport. Inga time_reports skapas automatiskt.
      </p>
    </div>
  );
}

function TargetCard({
  kind,
  id,
  label,
  onSite,
  recentlyLeft,
}: {
  kind: string;
  id: string;
  label: string;
  onSite: PresenceRow[];
  recentlyLeft: PresenceRow[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<TargetPresenceData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    // Only real targets (UUID-shaped id) can be loaded via get-target-presence
    if (!/^[0-9a-f-]{30,}$/i.test(id)) return;
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Inte inloggad");
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const organizationId = (profile as any)?.organization_id;
      if (!organizationId) throw new Error("Saknar organisation");
      const targetType =
        kind === "warehouse" ? "organization_location" : kind;
      const date = new Date().toISOString().slice(0, 10);
      const { data: resp, error: fnErr } = await supabase.functions.invoke<TargetPresenceData>(
        "get-target-presence",
        { body: { organizationId, targetType, targetId: id, date } },
      );
      if (fnErr) throw fnErr;
      setDetail(resp ?? null);
    } catch (e: any) {
      setDetailError(e?.message ?? String(e));
    } finally {
      setLoadingDetail(false);
    }
  }, [id, kind]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) loadDetail();
  };

  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{label}</div>
          <div className="text-xs text-muted-foreground">
            {KIND_LABEL[kind] ?? kind}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onSite.length > 0 && (
            <Badge className="bg-green-500 text-white">{onSite.length} på plats</Badge>
          )}
          {recentlyLeft.length > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
              {recentlyLeft.length} lämnat
            </Badge>
          )}
        </div>
      </button>

      {expanded && (
        <CardContent className="border-t pt-4 space-y-4">
          {detailError && (
            <p className="text-sm text-destructive">{detailError}</p>
          )}
          {loadingDetail && <p className="text-sm text-muted-foreground">Laddar…</p>}

          {/* Fallback: derive from staff presence rows when no detail available */}
          {!detail && !loadingDetail && (
            <div className="space-y-2">
              {[...onSite, ...recentlyLeft].map((r) => (
                <div key={r.staffId} className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <Badge className={interpretedVariant(r.interpretedStatus)}>
                    {r.interpretedStatus}
                  </Badge>
                  {r.arrival?.stillOnSite && (
                    <span className="text-xs text-muted-foreground">
                      Anlände {fmtTime(r.arrival.at)}
                    </span>
                  )}
                  {r.departure?.isLatest && (
                    <span className="text-xs text-muted-foreground">
                      Lämnade {fmtTime(r.departure.at)}
                    </span>
                  )}
                  {r.activeTimer.active && (
                    <Badge variant="outline" className="ml-auto bg-primary/10 text-primary border-primary/30">
                      Aktiv timer
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {detail && (
            <>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
                  Närvaroöversikt
                </div>
                {detail.roster.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga händelser idag.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.roster.map((r) => {
                      const meta = T_STATUS[r.status];
                      const stale = (r.signalAgeMinutes ?? 0) > 15;
                      return (
                        <div key={r.staffId} className="border rounded p-3 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{r.name}</span>
                            <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                            {r.hasActiveTimer && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                                Aktiv timer
                              </Badge>
                            )}
                            <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                              {stale ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                              {r.lastPingAt
                                ? formatDistanceToNow(new Date(r.lastPingAt), { locale: sv, addSuffix: true })
                                : "—"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div>
                              <div className="text-muted-foreground">Anlände</div>
                              <div>{fmtTime(r.arrivedAt)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Lämnade</div>
                              <div>{fmtTime(r.departedAt)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Confidence</div>
                              <div>
                                {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Timer</div>
                              <div className="truncate">
                                {r.activeTimer
                                  ? `${r.activeTimer.currentLabel ?? "—"} (${r.activeTimer.startSource ?? "?"})`
                                  : "Nej"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase">
                  Logghistorik (idag)
                </div>
                {detail.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Inga händelser idag.</p>
                ) : (
                  <div className="space-y-1">
                    {detail.history.map((h) => {
                      const isArrival = h.eventType === "arrival";
                      return (
                        <div
                          key={h.id}
                          className={`flex items-center gap-2 text-sm py-1 px-2 rounded ${
                            h.isFocusedTarget ? "bg-muted/50" : ""
                          }`}
                        >
                          <span className="font-mono text-xs text-muted-foreground w-12">
                            {fmtTime(h.eventAt)}
                          </span>
                          {isArrival ? (
                            <LogIn className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <LogOut className="h-3.5 w-3.5 text-amber-600" />
                          )}
                          <span className="font-medium">{h.staffName}</span>
                          <span className="text-muted-foreground">
                            {isArrival ? "anlände till" : "lämnade"}
                          </span>
                          <span className="font-medium">{h.targetLabel ?? "Okänd plats"}</span>
                          {h.confidence != null && (
                            <span className="text-xs text-muted-foreground ml-auto">
                              {Math.round(h.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
