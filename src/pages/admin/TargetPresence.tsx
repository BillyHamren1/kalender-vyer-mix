import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wifi, WifiOff, MapPin, LogIn, LogOut } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { sv } from "date-fns/locale";

type Status = "on_site" | "left" | "transport" | "unknown_place" | "no_signal";

interface RosterEntry {
  staffId: string;
  name: string;
  status: Status;
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

interface HistoryEntry {
  id: string;
  staffId: string;
  staffName: string;
  eventType: "arrival" | "departure";
  eventAt: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  confidence: number | null;
  isFocusedTarget: boolean;
}

interface PresenceResponse {
  date: string;
  target: { targetType: string; targetId: string };
  roster: RosterEntry[];
  history: HistoryEntry[];
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  on_site: { label: "På plats", cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30" },
  left: { label: "Lämnat", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  transport: { label: "Transport", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  unknown_place: { label: "Okänd plats", cls: "bg-muted text-muted-foreground border-border" },
  no_signal: { label: "Signal saknas", cls: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
};

export default function TargetPresence() {
  const { targetType: paramType, targetId: paramId } = useParams<{ targetType: string; targetId: string }>();
  const [search] = useSearchParams();
  const targetType = paramType ?? search.get("targetType") ?? "";
  const targetId = paramId ?? search.get("targetId") ?? "";

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(search.get("date") ?? today);
  const [data, setData] = useState<PresenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgIdQ = useMemo(() => supabase.auth.getUser(), []);

  const load = useCallback(async () => {
    if (!targetType || !targetId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await orgIdQ;
      if (!user) throw new Error("Inte inloggad");
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const organizationId = profile?.organization_id;
      if (!organizationId) throw new Error("Saknar organisation");

      const { data: resp, error: fnErr } = await supabase.functions.invoke<PresenceResponse>(
        "get-target-presence",
        { body: { organizationId, targetType, targetId, date } },
      );
      if (fnErr) throw fnErr;
      setData(resp ?? null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId, date, orgIdQ]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const fmtTime = (iso: string | null) => iso ? format(new Date(iso), "HH:mm") : "—";
  const fmtAge = (min: number | null) =>
    min == null ? "—" : formatDistanceToNow(new Date(Date.now() - min * 60_000), { addSuffix: true, locale: sv });

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Personal på plats
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {targetType} · {targetId} · {date}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-2 py-1 bg-background text-sm"
          />
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </div>
      </div>

      {error && (
        <Card><CardContent className="py-4 text-sm text-destructive">{error}</CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>Närvaroöversikt</CardTitle></CardHeader>
        <CardContent>
          {!data || data.roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga närvarohändelser för denna plats idag.</p>
          ) : (
            <div className="space-y-3">
              {data.roster.map((r) => {
                const meta = STATUS_META[r.status];
                const stale = (r.signalAgeMinutes ?? 0) > 15;
                return (
                  <div key={r.staffId} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{r.name}</span>
                        <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                        {r.hasActiveTimer && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            Aktiv timer
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {stale ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                        <span>Senaste ping: {fmtAge(r.signalAgeMinutes)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Anlände</div>
                        <div className="font-medium">{fmtTime(r.arrivedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Lämnade</div>
                        <div className="font-medium">{fmtTime(r.departedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Confidence</div>
                        <div className="font-medium">
                          {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Aktiv timer</div>
                        <div className="font-medium truncate">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Logghistorik</CardTitle></CardHeader>
        <CardContent>
          {!data || data.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga händelser idag.</p>
          ) : (
            <div className="space-y-1">
              {data.history.map((h) => {
                const isArrival = h.eventType === "arrival";
                return (
                  <div
                    key={h.id}
                    className={`flex items-center gap-3 text-sm py-1.5 px-2 rounded ${
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
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Detta är närvarologg, inte tidrapport. Inga time_reports skapas automatiskt.
      </p>
    </div>
  );
}
