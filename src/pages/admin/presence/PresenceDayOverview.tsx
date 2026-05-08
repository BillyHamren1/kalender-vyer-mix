import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  Activity,
  Search,
  MapPin,
  Navigation,
  HelpCircle,
  WifiOff as SignalOff,
  Clock,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toOverviewBlocks, type OverviewBlock } from "@/lib/presence/overviewBlock";

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
  /** New deterministic engine output. Preferred over `blocks` when present. */
  engineBlocks?: any[] | null;
  loading: boolean;
  error?: string | null;
}

const HOUR_PX = 64;
const ROW_H = 64;
const LEFT_W = 240;

const SIG_META = {
  live: { label: "Live", cls: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30", Icon: Wifi },
  recent: { label: "Nyligen", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30", Icon: Wifi },
  stale: { label: "Gammal", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", Icon: AlertTriangle },
  no_signal: { label: "Ingen signal", cls: "bg-muted text-muted-foreground border-border", Icon: WifiOff },
} as const;

type FilterKey =
  | "all"
  | "on_site"
  | "on_project"
  | "on_warehouse"
  | "transport"
  | "stale"
  | "no_signal"
  | "active_timer"
  | "needs_review";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "on_site", label: "På plats" },
  { key: "on_project", label: "På event/projekt" },
  { key: "on_warehouse", label: "På lager" },
  { key: "transport", label: "Transport" },
  { key: "stale", label: "Signal saknas" },
  { key: "no_signal", label: "Ingen signal" },
  { key: "active_timer", label: "Har aktiv timer" },
  { key: "needs_review", label: "Behöver granskas" },
];

type GroupKey = "all" | "warehouse" | "project" | "transport" | "no_signal";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "all", label: "Alla personal" },
  { key: "warehouse", label: "På lager" },
  { key: "project", label: "På projekt/event" },
  { key: "transport", label: "I transport" },
  { key: "no_signal", label: "Saknar signal" },
];

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

const isWarehouseLabel = (label: string) => /lager|warehouse|depå|depot/i.test(label);

type Category = "on_warehouse" | "on_project" | "transport" | "unknown" | "idle";

function categorize(row: DayRow | undefined, s: StaffMini): Category {
  // Prefer active timer label if any
  if (s.hasActiveTimer) {
    if (isWarehouseLabel(s.currentLabel)) return "on_warehouse";
    return "on_project";
  }
  // Find latest meaningful block (last by start time)
  const blocks = (row?.blocks ?? [])
    .filter((b) => ["smoothed_presence", "transport", "unknown_place"].includes(b.type))
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const last = blocks[0];
  if (!last) return "idle";
  if (last.type === "transport") return "transport";
  if (last.type === "unknown_place") return "unknown";
  // smoothed_presence
  if (isWarehouseLabel(last.label)) return "on_warehouse";
  return "on_project";
}

function needsReview(row: DayRow | undefined, s: StaffMini): boolean {
  if (!row) return false;
  const hasGap = row.blocks.some((b) => b.type === "gps_gap");
  if (hasGap) return true;
  if (s.signal === "stale" && s.hasActiveTimer) return true;
  if (s.signal === "no_signal" && s.hasActiveTimer) return true;
  return false;
}

function matchesFilter(filter: FilterKey, row: DayRow | undefined, s: StaffMini, cat: Category): boolean {
  switch (filter) {
    case "all": return true;
    case "on_site": return cat === "on_warehouse" || cat === "on_project";
    case "on_project": return cat === "on_project";
    case "on_warehouse": return cat === "on_warehouse";
    case "transport": return cat === "transport";
    case "stale": return s.signal === "stale";
    case "no_signal": return s.signal === "no_signal";
    case "active_timer": return s.hasActiveTimer;
    case "needs_review": return needsReview(row, s);
  }
}

function groupOf(s: StaffMini, cat: Category): GroupKey[] {
  const groups: GroupKey[] = ["all"];
  if (cat === "on_warehouse") groups.push("warehouse");
  if (cat === "on_project") groups.push("project");
  if (cat === "transport") groups.push("transport");
  if (s.signal === "stale" || s.signal === "no_signal") groups.push("no_signal");
  return groups;
}

export default function PresenceDayOverview() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const [staff, setStaff] = useState<StaffMini[] | null>(null);
  const [rows, setRows] = useState<Record<string, DayRow>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    all: false, warehouse: false, project: false, transport: false, no_signal: false,
  });
  const [selected, setSelected] = useState<{ staff: StaffMini; block: OverviewBlock } | null>(null);
  const [showTech, setShowTech] = useState(false);
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
        const engineBlocks = (data as any).presenceDayBlocks ?? null;
        setRows((prev) => ({
          ...prev,
          [st.staffId]: { ...st, blocks, engineBlocks, loading: false },
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

  // Filtered/categorized staff
  const decorated = useMemo(() => {
    if (!staff) return [];
    const q = search.trim().toLowerCase();
    return staff
      .map((s) => {
        const row = rows[s.staffId];
        const cat = categorize(row, s);
        return { s, row, cat };
      })
      .filter(({ s, row, cat }) => {
        if (q && !s.name.toLowerCase().includes(q)) return false;
        return matchesFilter(filter, row, s, cat);
      });
  }, [staff, rows, search, filter]);

  // Group buckets
  const grouped = useMemo(() => {
    const buckets: Record<GroupKey, typeof decorated> = {
      all: [], warehouse: [], project: [], transport: [], no_signal: [],
    };
    for (const item of decorated) {
      for (const g of groupOf(item.s, item.cat)) {
        buckets[g].push(item);
      }
    }
    return buckets;
  }, [decorated]);

  const renderBlock = (
    b: OverviewBlock,
    key: string,
    onClick?: () => void,
  ) => {
    if (!b.endAt && b.kind !== "timer") return null;
    const startMin = minutesOfDay(b.startAt, dayStart) - minOffset;
    const endMin = b.endAt ? minutesOfDay(b.endAt, dayStart) - minOffset : startMin;
    const left = (startMin / 60) * HOUR_PX;
    const width = Math.max(2, ((endMin - startMin) / 60) * HOUR_PX);

    if (b.kind === "work_site") {
      const inlineGap = b.meta?.inlineGapMinutes ?? 0;
      return (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className="absolute top-2 bottom-2 rounded-md border border-primary/40 bg-primary/15 hover:bg-primary/25 text-primary px-2 flex items-center gap-1 text-[11px] font-medium overflow-hidden shadow-sm cursor-pointer transition-colors"
          style={{ left, width }}
          title={`${b.title} · ${b.durationLabel}${inlineGap > 0 ? ` · signalglapp ${inlineGap} min` : ""}`}
        >
          <span className="truncate">{b.title}</span>
          <span className="opacity-70 shrink-0">· {b.durationLabel}</span>
          {b.reviewState === "signal_issue" && (
            <SignalOff className="h-3 w-3 text-amber-500 shrink-0" />
          )}
        </button>
      );
    }
    if (b.kind === "transport") {
      const fromTo = b.subtitle || "Transport";
      return (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className="absolute top-5 bottom-5 rounded-sm border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-700 dark:text-cyan-400 px-1.5 flex items-center text-[10px] overflow-hidden cursor-pointer transition-colors"
          style={{ left, width }}
          title={`Transport · ${fromTo} · ${b.durationLabel}`}
        >
          <Navigation className="h-2.5 w-2.5 mr-1 shrink-0" />
          <span className="truncate">{fromTo}</span>
          <span className="ml-1 opacity-70 shrink-0">· {b.durationLabel}</span>
        </button>
      );
    }
    if (b.kind === "unknown") {
      return (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className="absolute top-3 bottom-3 rounded-sm border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 flex items-center text-[10px] overflow-hidden cursor-pointer transition-colors"
          style={{ left, width }}
          title={`Okänd plats · behöver granskas · ${b.durationLabel}`}
        >
          <HelpCircle className="h-2.5 w-2.5 mr-1 shrink-0" />
          <span className="truncate">Okänd plats</span>
          {b.reviewState === "needs_review" && (
            <span className="ml-1 opacity-70 shrink-0">· granska</span>
          )}
          <span className="ml-1 opacity-70 shrink-0">· {b.durationLabel}</span>
        </button>
      );
    }
    if (b.kind === "signal_gap") {
      return (
        <button
          key={key}
          type="button"
          onClick={onClick}
          className="absolute top-4 bottom-4 rounded-sm border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-1.5 flex items-center text-[10px] overflow-hidden cursor-pointer transition-colors"
          style={{ left, width }}
          title={`Signal saknas · ${b.durationLabel}`}
        >
          <SignalOff className="h-2.5 w-2.5 mr-1 shrink-0" />
          <span className="truncate">Signal saknas</span>
          <span className="ml-1 opacity-70 shrink-0">· {b.durationLabel}</span>
        </button>
      );
    }
    if (b.kind === "timer") {
      const isStart = b.title === "Timer startad";
      return (
        <div
          key={key}
          className={`absolute top-1 bottom-1 w-[2px] ${isStart ? "bg-primary" : "bg-primary/50"}`}
          style={{ left }}
          title={`${b.title} · ${b.subtitle ?? ""}`}
        />
      );
    }
    return null;
  };

  const renderStaffRow = (item: { s: StaffMini; row: DayRow | undefined; cat: Category }) => {
    const { s, row } = item;
    const sigMeta = SIG_META[s.signal];
    const SigIcon = sigMeta.Icon;
    const review = needsReview(row, s);
    return (
      <div key={s.staffId} className="flex border-b hover:bg-muted/30 transition-colors" style={{ height: ROW_H }}>
        <Link to={`/admin/presence/staff/${s.staffId}?date=${date}`} className="sticky left-0 z-10 bg-background hover:bg-muted/50 border-r flex flex-col justify-center px-3 gap-0.5" style={{ width: LEFT_W, minWidth: LEFT_W }}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{s.name}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={`${sigMeta.cls} text-[10px] px-1.5 py-0 h-4`}>
              <SigIcon className="h-2.5 w-2.5 mr-1" />
              {sigMeta.label}
            </Badge>
            {s.hasActiveTimer && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/40 text-primary">
                <Activity className="h-2.5 w-2.5 mr-1" /> Timer
              </Badge>
            )}
            {review && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Granska
              </Badge>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{s.currentLabel || "—"}</div>
        </Link>
        <div className="relative" style={{ width: totalWidth }}>
          {Array.from({ length: totalHours + 1 }).map((_, i) => (
            <div key={i} className="absolute top-0 bottom-0 border-l border-border/40" style={{ left: i * HOUR_PX }} />
          ))}
          {row?.loading && (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">Laddar…</div>
          )}
          {row?.error && !row.loading && (
            <div className="absolute inset-0 flex items-center pl-2 text-[11px] text-destructive">{row.error}</div>
          )}
          {row && toOverviewBlocks(s.staffId, s.name, date, row.blocks as any).map((b, i) =>
            renderBlock(b, `${s.staffId}-${i}`, () => {
              setShowTech(false);
              setSelected({ staff: s, block: b });
            }),
          )}
        </div>
      </div>
    );
  };

  const fmtTime = (iso?: string | null) => (iso ? format(new Date(iso), "HH:mm") : "—");

  return (
    <Card>
      <CardContent className="p-0">
        {/* Toolbar row 1: date + search + refresh */}
        <div className="flex items-center justify-between gap-3 p-3 border-b flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-muted-foreground">Datum</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-[160px]" />
            <Button variant="outline" size="sm" onClick={() => setDate(today)}>Idag</Button>
            <div className="relative ml-2">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Sök personal…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-[220px] pl-7"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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

        {/* Toolbar row 2: filter chips */}
        <div className="flex items-center gap-1.5 p-2 border-b bg-muted/20 flex-wrap">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Button
                key={f.key}
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            );
          })}
        </div>

        {/* Gantt body — grouped */}
        <div className="relative overflow-x-auto">
          <div style={{ minWidth: LEFT_W + totalWidth }}>
            {/* Sticky time header */}
            <div className="flex border-b sticky top-0 bg-background z-20">
              <div className="sticky left-0 z-30 bg-background border-r" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Personal ({decorated.length}/{staff?.length ?? 0})
                </div>
              </div>
              <div className="relative" style={{ width: totalWidth, height: 32 }}>
                {Array.from({ length: totalHours + 1 }).map((_, i) => {
                  const h = startHour + i;
                  return (
                    <div key={i} className="absolute top-0 bottom-0 border-l border-border/60 text-[10px] text-muted-foreground pl-1" style={{ left: i * HOUR_PX }}>
                      {String(h).padStart(2, "0")}
                    </div>
                  );
                })}
              </div>
            </div>

            {!staff && <div className="p-6 text-sm text-muted-foreground">Laddar personal…</div>}
            {staff && staff.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">Ingen personal hittad.</div>
            )}

            {staff && GROUPS.map((g) => {
              const items = grouped[g.key];
              if (!items.length) return null;
              const isCollapsed = collapsed[g.key];
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                    className="w-full sticky left-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-muted/40 hover:bg-muted/60 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ width: LEFT_W + totalWidth }}
                  >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <span>{g.label}</span>
                    <span className="opacity-60">({items.length})</span>
                  </button>
                  {!isCollapsed && items.map(renderStaffRow)}
                </div>
              );
            })}

            {staff && decorated.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">Inga personer matchar filtret.</div>
            )}
          </div>
        </div>

        <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
          Smoothed presence-block (samma som personens dagvy). Ingen rådata, inga time_reports/workdays/LTE/travel skapas.
          Klicka på en rad för full detalj. {format(new Date(), "HH:mm")}
        </div>
      </CardContent>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {selected.block.kind === "work_site" && <MapPin className="h-4 w-4" />}
                  {selected.block.kind === "transport" && <Navigation className="h-4 w-4" />}
                  {selected.block.kind === "unknown" && <HelpCircle className="h-4 w-4" />}
                  {selected.block.kind === "signal_gap" && <SignalOff className="h-4 w-4" />}
                  {selected.block.kind === "timer" && <Activity className="h-4 w-4" />}
                  {selected.block.title}
                </SheetTitle>
                <SheetDescription>{selected.staff.name}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-3 text-sm">
                {selected.block.kind === "work_site" && selected.block.targetLabel && (
                  <Row label="Plats" value={selected.block.targetLabel} />
                )}
                {selected.block.kind === "transport" && (
                  <>
                    <Row label="Från" value={selected.block.fromLabel || "Okänd startpunkt"} />
                    <Row label="Till" value={selected.block.toLabel || "Okänd destination"} />
                  </>
                )}
                {selected.block.kind === "unknown" && (
                  <Row label="Status" value="Behöver granskas" />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Row label="Start" value={fmtTime(selected.block.startAt)} icon={<Clock className="h-3 w-3" />} />
                  <Row label="Slut" value={fmtTime(selected.block.endAt)} icon={<Clock className="h-3 w-3" />} />
                </div>
                {selected.block.durationMinutes > 0 && (
                  <Row label="Längd" value={selected.block.durationLabel} />
                )}

                {selected.block.reviewState !== "ok" && (
                  <Row
                    label="Granskningsstatus"
                    value={
                      selected.block.reviewState === "needs_review"
                        ? "Behöver granskas"
                        : selected.block.reviewState === "signal_issue"
                          ? "Signalproblem"
                          : "Ignorerad"
                    }
                  />
                )}

                {(selected.block.meta?.inlineGapMinutes ?? 0) > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                    <span>Signalglapp under besöket: {selected.block.meta?.inlineGapMinutes} min</span>
                  </div>
                )}
                {selected.block.confidence !== null && (
                  <Row label="Confidence" value={selected.block.confidence.toFixed(2)} />
                )}

                <div className="pt-2">
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setShowTech((v) => !v)}>
                    {showTech ? "Dölj tekniska detaljer" : "Visa tekniska detaljer"}
                  </Button>
                </div>
                {showTech && (
                  <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-x-auto max-h-[300px]">
                    {JSON.stringify(selected.block, null, 2)}
                  </pre>
                )}

                <div className="pt-2">
                  <Link
                    to={`/admin/presence/staff/${selected.staff.staffId}?date=${date}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Öppna full personvy →
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
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
