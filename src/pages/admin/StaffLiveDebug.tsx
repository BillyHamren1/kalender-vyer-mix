import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, MapPin, Clock, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface StaffRow {
  id: string;
  name: string;
  ping?: { lat: number; lng: number; accuracy: number | null; speed: number | null; updated_at: string; location_since: string | null };
  openEntry?: { id: string; entered_at: string; location_id: string | null; booking_id: string | null; large_project_id: string | null; source: string };
  lastTravel?: { id: string; start_time: string; end_time: string | null; to_address: string | null };
  unresolvedPrompt?: { id: string; arrived_at: string; target_type: string | null; target_id: string | null };
  assignedTargets: Array<{ kind: "booking" | "project"; id: string; label: string; lat: number; lng: number; distance: number | null }>;
}

export default function StaffLiveDebug() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];

      const [{ data: staff }, { data: pings }, { data: openEntries }, { data: travels }, { data: prompts }, { data: bsa }, { data: lps }] =
        await Promise.all([
          supabase.from("staff_members").select("id, name").eq("is_active", true).order("name"),
          supabase.from("staff_locations").select("staff_id, latitude, longitude, accuracy, speed, updated_at, location_since"),
          supabase.from("location_time_entries").select("id, staff_id, entered_at, location_id, booking_id, large_project_id, source").is("exited_at", null),
          supabase.from("travel_time_logs").select("id, staff_id, start_time, end_time, to_address").gte("report_date", today).order("start_time", { ascending: false }),
          supabase.from("arrival_prompt_log").select("id, staff_id, arrived_at, target_type, target_id").eq("resolved", false),
          supabase
            .from("booking_staff_assignments")
            .select("staff_id, booking_id, bookings:booking_id(id, client, deliveryaddress, delivery_latitude, delivery_longitude)")
            .eq("assignment_date", today),
          supabase
            .from("large_project_staff")
            .select("staff_id, large_project_id, large_projects:large_project_id(id, name, address_latitude, address_longitude)"),
        ]);

      if (cancelled) return;

      const pingMap = new Map((pings || []).map((p: any) => [p.staff_id, p]));
      const entryMap = new Map<string, any>();
      for (const e of openEntries || []) {
        if (!entryMap.has(e.staff_id)) entryMap.set(e.staff_id, e);
      }
      const travelMap = new Map<string, any>();
      for (const t of travels || []) {
        if (!travelMap.has(t.staff_id)) travelMap.set(t.staff_id, t);
      }
      const promptMap = new Map<string, any>();
      for (const p of prompts || []) {
        if (!promptMap.has(p.staff_id)) promptMap.set(p.staff_id, p);
      }
      const bsaByStaff = new Map<string, any[]>();
      for (const r of (bsa as any[]) || []) {
        const arr = bsaByStaff.get(r.staff_id) || [];
        if (r.bookings?.delivery_latitude != null) {
          arr.push({
            kind: "booking" as const,
            id: r.bookings.id,
            label: `${r.bookings.client} — ${r.bookings.deliveryaddress || ""}`,
            lat: r.bookings.delivery_latitude,
            lng: r.bookings.delivery_longitude,
          });
        }
        bsaByStaff.set(r.staff_id, arr);
      }
      for (const r of (lps as any[]) || []) {
        const arr = bsaByStaff.get(r.staff_id) || [];
        if (r.large_projects?.address_latitude != null) {
          arr.push({
            kind: "project" as const,
            id: r.large_projects.id,
            label: r.large_projects.name,
            lat: r.large_projects.address_latitude,
            lng: r.large_projects.address_longitude,
          });
        }
        bsaByStaff.set(r.staff_id, arr);
      }

      const built: StaffRow[] = (staff || []).map((s: any) => {
        const ping = pingMap.get(s.id) as any;
        const targets = bsaByStaff.get(s.id) || [];
        const withDist = targets.map((t) => ({
          ...t,
          distance: ping ? Math.round(haversineMeters(ping.latitude, ping.longitude, t.lat, t.lng)) : null,
        }));
        return {
          id: s.id,
          name: s.name,
          ping: ping
            ? {
                lat: ping.latitude,
                lng: ping.longitude,
                accuracy: ping.accuracy,
                speed: ping.speed,
                updated_at: ping.updated_at,
                location_since: ping.location_since,
              }
            : undefined,
          openEntry: entryMap.get(s.id),
          lastTravel: travelMap.get(s.id),
          unresolvedPrompt: promptMap.get(s.id),
          assignedTargets: withDist,
        };
      });

      // Filter to staff with any signal today (ping or assignment).
      const filtered = built.filter((r) => r.ping || r.assignedTargets.length > 0 || r.openEntry || r.lastTravel || r.unresolvedPrompt);
      setRows(filtered);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const flagged = useMemo(() => {
    return rows.filter((r) => {
      if (!r.ping) return false;
      const pingAge = (Date.now() - new Date(r.ping.updated_at).getTime()) / 60000;
      if (pingAge > 10) return false; // stale ping → not actively concerning
      const stationarySince = r.ping.location_since ? (Date.now() - new Date(r.ping.location_since).getTime()) / 60000 : 0;
      const stationaryOnAssigned =
        stationarySince > 15 &&
        r.assignedTargets.some((t) => t.distance != null && t.distance <= 150) &&
        !r.openEntry;
      return stationaryOnAssigned;
    });
  }, [rows]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Personal live (debug)</h1>
          <p className="text-muted-foreground">Real-tids GPS, öppna pass, väntande prompts och avstånd till tilldelade jobb.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Uppdatera
        </Button>
      </div>

      {flagged.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Röda flaggor ({flagged.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {flagged.map((r) => (
                <li key={r.id}>
                  <strong>{r.name}</strong> — stillastående &gt;15 min på tilldelad plats utan incheckning.
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="text-muted-foreground">Laddar...</div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const pingAgeMin = r.ping ? (Date.now() - new Date(r.ping.updated_at).getTime()) / 60000 : null;
            const stale = pingAgeMin != null && pingAgeMin > 5;
            const isFlagged = flagged.some((f) => f.id === r.id);
            return (
              <Card key={r.id} className={isFlagged ? "border-destructive" : undefined}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{r.name}</span>
                    {isFlagged && <Badge variant="destructive">Röd flagga</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <MapPin className="h-4 w-4" />
                    {r.ping ? (
                      <>
                        <span className={stale ? "text-muted-foreground" : ""}>
                          {r.ping.lat.toFixed(5)}, {r.ping.lng.toFixed(5)}
                        </span>
                        <Badge variant="outline">acc {r.ping.accuracy ? `${Math.round(r.ping.accuracy)}m` : "?"}</Badge>
                        <Badge variant="outline">speed {r.ping.speed != null ? `${r.ping.speed.toFixed(1)} m/s` : "?"}</Badge>
                        <span className="text-muted-foreground">
                          ({formatDistanceToNow(new Date(r.ping.updated_at), { locale: sv, addSuffix: true })})
                        </span>
                        {r.ping.location_since && (
                          <span className="text-muted-foreground">
                            • stillastående sedan {format(new Date(r.ping.location_since), "HH:mm")}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Ingen GPS-ping</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Clock className="h-4 w-4" />
                    {r.openEntry ? (
                      <>
                        <Badge>Pågående pass ({r.openEntry.source})</Badge>
                        <span className="text-muted-foreground">
                          sedan {format(new Date(r.openEntry.entered_at), "HH:mm")}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Inget öppet pass</span>
                    )}
                    {r.lastTravel && (
                      <span className="text-muted-foreground">
                        • Senaste resa {format(new Date(r.lastTravel.start_time), "HH:mm")}–
                        {r.lastTravel.end_time ? format(new Date(r.lastTravel.end_time), "HH:mm") : "pågående"}
                      </span>
                    )}
                    {r.unresolvedPrompt && (
                      <Badge variant="secondary">
                        Väntande prompt ({r.unresolvedPrompt.target_type}) sedan {format(new Date(r.unresolvedPrompt.arrived_at), "HH:mm")}
                      </Badge>
                    )}
                  </div>

                  {r.assignedTargets.length > 0 && (
                    <div className="text-muted-foreground">
                      Tilldelade idag:{" "}
                      {r.assignedTargets
                        .sort((a, b) => (a.distance ?? 1e12) - (b.distance ?? 1e12))
                        .map((t) => `${t.label} (${t.distance != null ? `${t.distance}m` : "?"})`)
                        .join(" • ")}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
