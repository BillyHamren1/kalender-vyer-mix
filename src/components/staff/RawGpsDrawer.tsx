import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Database, Download, Filter } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DayPing } from "@/hooks/admin/useDayPings";
import type { DayTimelineEvent } from "@/hooks/admin/useDayTimeline";

interface Props {
  pings: DayPing[];
  date: string;
  staffName?: string;
  selectedEvent: DayTimelineEvent | null;
}

const FILTER_WINDOW_MIN = 10;

function tsLocal(t: string) {
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function downloadCsv(rows: DayPing[], date: string, staffName?: string) {
  const head = ["recorded_at", "lat", "lng", "accuracy_m", "speed_mps", "time_report_id"];
  const lines = [head.join(",")];
  for (const p of rows) {
    lines.push([
      p.recorded_at,
      p.lat,
      p.lng,
      p.accuracy ?? "",
      p.speed ?? "",
      p.time_report_id ?? "",
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gps-${(staffName ?? "staff").replace(/\s+/g, "_")}-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function RawGpsDrawer({ pings, date, staffName, selectedEvent }: Props) {
  const [open, setOpen] = useState(false);
  const [filterAroundEvent, setFilterAroundEvent] = useState(false);

  const filtered = useMemo(() => {
    if (!filterAroundEvent || !selectedEvent) return pings;
    const center = new Date(selectedEvent.ts).getTime();
    if (Number.isNaN(center)) return pings;
    const win = FILTER_WINDOW_MIN * 60_000;
    return pings.filter((p) => {
      const t = new Date(p.recorded_at).getTime();
      return Math.abs(t - center) <= win;
    });
  }, [pings, filterAroundEvent, selectedEvent]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Database className="h-3 w-3" /> Visa rå GPS-data
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" /> Rå GPS-data
          </SheetTitle>
          <div className="text-xs text-muted-foreground">
            {date}{staffName ? ` · ${staffName}` : ""} · {filtered.length} av {pings.length} pings
          </div>
        </SheetHeader>

        <div className="flex items-center justify-between gap-2 py-2">
          <Button
            type="button" size="sm" variant={filterAroundEvent ? "default" : "outline"}
            className="h-7 gap-1 text-xs" disabled={!selectedEvent}
            onClick={() => setFilterAroundEvent((v) => !v)}
          >
            <Filter className="h-3 w-3" />
            {filterAroundEvent ? "Visar runt vald händelse" : `Filtrera ±${FILTER_WINDOW_MIN} min runt vald`}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs"
            onClick={() => downloadCsv(filtered, date, staffName)}>
            <Download className="h-3 w-3" /> Exportera CSV
          </Button>
        </div>

        <div className="flex-1 overflow-auto rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Tid</TableHead>
                <TableHead>Lat</TableHead>
                <TableHead>Lng</TableHead>
                <TableHead className="w-16 text-right">Acc (m)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-6">
                    Inga pings i urvalet
                  </TableCell>
                </TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono tabular-nums text-xs">{tsLocal(p.recorded_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.lat.toFixed(5)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.lng.toFixed(5)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {p.accuracy != null ? Math.round(p.accuracy) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default RawGpsDrawer;
