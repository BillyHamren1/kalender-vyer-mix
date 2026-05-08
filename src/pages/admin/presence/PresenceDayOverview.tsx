import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, RefreshCw, Wifi, WifiOff, AlertTriangle, Activity } from "lucide-react";

interface Block {
  at: string;
  endAt?: string | null;
  durationMin?: number | null;
  type:
    | "smoothed_presence"
    | "transport"
    | "unknown_place"
    | "gps_gap"
    | "active_timer_started"
    | "active_timer_stopped"
    | string;
  label: string;
}

interface StaffMini {
  staffId: string;
  name: string;
  signal: "live" | "recent" | "stale" | "no_signal";
  hasActiveTimer: boolean;
  currentLabel: string;
}

interface DayRow extends StaffMini {
  blocks: Block[];
  loading: boolean;
  error?: string | null;
}

const HOUR_PX = 64; // 1h column width
const ROW_H = 64;
const LEFT_W = 240;

const SIG_META = {
  live: { label: "Live", cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", Icon: Wifi },
  recent: { label: "Nyligen", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30", Icon: Wifi },
  stale: { label: "Gammal", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", Icon: AlertTriangle },
  no_signal: { label: "Ingen signal", cls: "bg-muted text-muted-foreground border-border", Icon: WifiOff },
} as const;

const fmtDur = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
};

const minutesOfDay = (iso: string, dayStart: Date): number => {
  const t = new Date(iso).getTime();
  return Math.max(0, Math.round((t - dayStart.getTime()) / 60000));
};

async function fetchPool<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await worker(items[idx]);
      } catch (e: any) {
        // @ts-expect-error allow error placeholder
        out[idx] = { error: e?.message ?? String(e) };
      }
    }
  });
  await Promise.all(runners);
  return out;
}

export default function PresenceDayOverview() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const [staff, setStaff] = useState<StaffMini[] | null>(null);
  const [rows, setRows] = useState<Record<string, DayRow>>({});
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  const loadStaff = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("get-staff-presence", { body: {} });
    if (error) throw error;
    if (!(data as any)?.ok) throw new Error((data as any)?.error || "presence_failed");
    const list: StaffMini[] = ((data as any).presence ?? []).map((p: any) => ({
      staffId: p.staffId,
      name: p.name,
      signal: p.signal,
      hasActiveTimer: !!p.activeTimer?.active,
      currentLabel: p.targetLabel ?? "",
    }));
    list.sort((a, b) => a.name.localeCompare(b.name, "sv"));
    setStaff(list);
    return list;
  }, []);

  const loadDay = useCallback(async (s: StaffMini[], d: string) => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    // Initialize rows in loading state, preserving order
    const init: Record<string, DayRow> = {};
    for (const st of s) init[st.staffId] = { ...st, blocks: [], loading: true };
    setRows(init);

    await fetchPool(
      s,
      async (st) => {
        const { data, error } = await supabase.functions.invoke("get-staff-presence-day", {
          body: { staffId: st.staffId, date: d },
        });
        if (myReq !== reqIdRef.current) return null;
        if (error || !(data as any)?.ok) {
          setRows((prev) => ({
            ...prev,
            [st.staffId]: { ...st, blocks: [], loading: false, error: error?.message ?? (data as any)?.error ?? "fel" },
          }));
          return null;
        }
        const tl: any[] = (data as any).timeline ?? [];
        const blocks: Block[] = tl.filter((r) =>
          ["smoothed_presence", "transport", "unknown_place", "gps_gap", "active_timer_started", "active_timer_stopped"].includes(r.type),
        );
        setRows((prev) => ({
          ...prev,
          [st.staffId]: { ...st, blocks, loading: false },
        }));
        return null;
      },
      4,
    );
    if (myReq === reqIdRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await loadStaff();
        if (cancelled) return;
        await loadDay(s, date);
      } catch {
        /* handled per-row */
      }
    })();
    return () => { cancelled = true; };
  }, [date, loadStaff, loadDay]);

  // Compute time-axis range from data, clamped to a sensible default 06–20.
  const { dayStart, startHour, endHour, totalHours } = useMemo(() => {
    const ds = new Date(`${date}T00:00:00`);
    let minH = 6;
    let maxH = 20;
    for (const r of Object.values(rows)) {
      for (const b of r.blocks) {
        if (b.at) minH = Math.min(minH, new Date(b.at).getHours());
        if (b.endAt) maxH = Math.max(maxH, new Date(b.endAt).getHours() + 1);
      }
    }
    minH = Math.max(0, Math.min(minH, 6));
    maxH = Math.min(24, Math.max(maxH, 20));
    return { dayStart: ds, startHour: minH, endHour: maxH, totalHours: maxH - minH };
  }, [rows, date]);

  const totalWidth = totalHours * HOUR_PX;
  const minOffset = startHour * 60;

  const renderBlock = (b: Block, key: string) => {
    if (!b.endAt && b.type !== "active_timer_started" && b.type !== "active_timer_stopped") return null;
    const startMin = minutesOfDay(b.at, dayStart) - minOffset;
    const endMin = b.endAt ? minutesOfDay(b.endAt, dayStart) - minOffset : startMin;
    const left = (startMin / 60) * HOUR_PX;
    const width = Math.max(2, ((endMin - startMin) / 60) * HOUR_PX);
    const dur = b.durationMin ?? Math.max(0, endMin - startMin);

    if (b.type === "smoothed_presence") {
      return (
        <div
          key={key}
          className="absolute top-2 bottom-2 rounded-md border border-primary/40 bg-primary/15 text-primary px-2 flex items-center text-[11px] font-medium overflow-hidden shadow-sm"
          style={{ left, width }}
          title={`${b.label} · ${fmtDur(dur)}`}
        >
          <span className="truncate">{b.label}</span>
          <span className="ml-1 opacity-70 shrink-0">· {fmtDur(dur)}</span>
        </div>
      );
    }
    if (b.type === "transport") {
      return (
        <div
          key={key}
          className="absolute top-5 bottom-5 rounded-sm border border-cyan-500/40 bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 px-1.5 flex items-center text-[10px] overflow-hidden"
          style={{ left, width }}
          title={`Transport · ${fmtDur(dur)}`}
        >
          <span className="truncate">→ {fmtDur(dur)}</span>
        </div>
      );
    }
    if (b.type === "unknown_place") {
      return (
        <div
          key={key}
          className="absolute top-3 bottom-3 rounded-sm border border-border bg-muted/60 text-muted-foreground px-1.5 flex items-center text-[10px] overflow-hidden"
          style={{ left, width }}
          title={`Okänd plats · ${fmtDur(dur)}`}
        >
          <span className="truncate">Okänd · {fmtDur(dur)}</span>
        </div>
      );
    }
    if (b.type === "gps_gap") {
      return (
        <div
          key={key}
          className="absolute top-1/2 -translate-y-1/2 h-[3px] bg-amber-500/60 rounded-full"
          style={{ left, width }}
          title={`Signalglapp · ${fmtDur(dur)}`}
        />
      );
    }
    if (b.type === "active_timer_started" || b.type === "active_timer_stopped") {
      return (
        <div
          key={key}
          className={`absolute top-1 bottom-1 w-[2px] ${b.type === "active_timer_started" ? "bg-primary" : "bg-primary/50"}`}
          style={{ left }}
          title={`${b.type === "active_timer_started" ? "Timer startad" : "Timer stoppad"} · ${b.label}`}
        />
      );
    }
    return null;
  };

  return (
    <Card>
      <CardContent className="p-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 p-3 border-b">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Datum</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-[160px]"
            />
            <Button variant="outline" size="sm" onClick={() => setDate(today)}>Idag</Button>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Legend swatch="bg-primary/30 border-primary/40" label="På plats" />
            <Legend swatch="bg-cyan-500/30 border-cyan-500/40" label="Transport" />
            <Legend swatch="bg-muted border-border" label="Okänd" />
            <Legend swatch="bg-amber-500/60 border-transparent h-[3px] mt-1.5" label="Signalglapp" />
            <Button variant="ghost" size="sm" onClick={() => staff && loadDay(staff, date)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Uppdatera
            </Button>
          </div>
        </div>

        {/* Gantt body */}
        <div className="relative overflow-x-auto">
          <div style={{ minWidth: LEFT_W + totalWidth }}>
            {/* Sticky header */}
            <div className="flex border-b sticky top-0 bg-background z-20">
              <div
                className="sticky left-0 z-30 bg-background border-r"
                style={{ width: LEFT_W, minWidth: LEFT_W }}
              >
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Personal ({staff?.length ?? 0})
                </div>
              </div>
              <div className="relative" style={{ width: totalWidth, height: 32 }}>
                {Array.from({ length: totalHours + 1 }).map((_, i) => {
                  const h = startHour + i;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/60 text-[10px] text-muted-foreground pl-1"
                      style={{ left: i * HOUR_PX }}
                    >
                      {String(h).padStart(2, "0")}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            {!staff && (
              <div className="p-6 text-sm text-muted-foreground">Laddar personal…</div>
            )}
            {staff?.map((s) => {
              const row = rows[s.staffId];
              const sigMeta = SIG_META[s.signal];
              const SigIcon = sigMeta.Icon;
              return (
                <div
                  key={s.staffId}
                  className="flex border-b hover:bg-muted/30 transition-colors"
                  style={{ height: ROW_H }}
                >
                  <Link
                    to={`/admin/presence/staff/${s.staffId}?date=${date}`}
                    className="sticky left-0 z-10 bg-background hover:bg-muted/50 border-r flex flex-col justify-center px-3 gap-0.5"
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{s.name}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`${sigMeta.cls} text-[10px] px-1.5 py-0 h-4`}>
                        <SigIcon className="h-2.5 w-2.5 mr-1" />
                        {sigMeta.label}
                      </Badge>
                      {s.hasActiveTimer && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                          <Activity className="h-2.5 w-2.5 mr-1" /> Timer
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{s.currentLabel || "—"}</div>
                  </Link>
                  <div className="relative" style={{ width: totalWidth }}>
                    {/* Hour grid */}
                    {Array.from({ length: totalHours + 1 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-border/40"
                        style={{ left: i * HOUR_PX }}
                      />
                    ))}
                    {row?.loading && (
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                        Laddar…
                      </div>
                    )}
                    {row?.error && !row.loading && (
                      <div className="absolute inset-0 flex items-center pl-2 text-[11px] text-destructive">
                        {row.error}
                      </div>
                    )}
                    {row?.blocks.map((b, i) => renderBlock(b, `${s.staffId}-${i}`))}
                  </div>
                </div>
              );
            })}
            {staff && staff.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">Ingen personal hittad.</div>
            )}
          </div>
        </div>

        <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
          Smoothed presence-block (samma som personens dagvy). Ingen rådata, inga time_reports/workdays/LTE/travel skapas.
          Klicka på en rad för full detalj. {format(new Date(), "HH:mm")}
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded-sm border ${swatch}`} />
      {label}
    </span>
  );
}
