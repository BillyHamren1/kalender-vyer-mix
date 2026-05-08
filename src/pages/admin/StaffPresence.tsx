import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, MapPin, Activity, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

const signalVariant = (s: Signal): { label: string; cls: string; icon: any } => {
  switch (s) {
    case "live":
      return { label: "Live", cls: "bg-green-500 text-white", icon: Wifi };
    case "recent":
      return { label: "Nyligen", cls: "bg-blue-500 text-white", icon: Wifi };
    case "stale":
      return { label: "Gammal", cls: "bg-yellow-500 text-black", icon: AlertTriangle };
    case "no_signal":
      return { label: "Ingen signal", cls: "bg-muted text-muted-foreground", icon: WifiOff };
  }
};

const interpretedVariant = (s: Interpreted): string => {
  switch (s) {
    case "på event":
      return "bg-primary text-primary-foreground";
    case "på lager":
      return "bg-amber-500 text-white";
    case "transport":
      return "bg-cyan-500 text-white";
    case "GPS-glapp":
      return "bg-destructive text-destructive-foreground";
    case "okänd plats":
    default:
      return "bg-muted text-muted-foreground";
  }
};

export default function StaffPresence() {
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

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personalnärvaro</h1>
          <p className="text-sm text-muted-foreground">
            Var är personalen just nu? Drivs av nya Time Engine / GPS-flödet — läser inte
            workdays, time_reports, location_time_entries eller travel_time_logs.
          </p>
          {generatedAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Uppdaterad {formatDistanceToNow(new Date(generatedAt), { locale: sv, addSuffix: true })}
            </p>
          )}
        </div>
        <Button onClick={fetchData} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Uppdatera
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">Fel: {error}</CardContent>
        </Card>
      )}

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
                <div className="flex items-center gap-2">
                  <Badge className={interpretedVariant(r.interpretedStatus)}>
                    {r.interpretedStatus}
                  </Badge>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-foreground">{r.targetLabel}</div>
                    {r.matchedTarget && (
                      <div className="text-xs">
                        {r.matchedTarget.kind} · {r.matchedTarget.distanceMeters} m från centrum
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
                <div className="flex items-center gap-2 pt-1 border-t">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  {r.activeTimer.active ? (
                    <div className="flex-1 min-w-0">
                      <div className="text-xs">
                        <span className="font-semibold text-foreground">Aktiv timer</span>
                        {r.activeTimer.autoStarted && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            auto
                          </Badge>
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
    </div>
  );
}
