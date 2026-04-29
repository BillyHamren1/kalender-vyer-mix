import { useMemo } from "react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import type { OpsJob, OpsScanEvent, OpsShift } from "@/hooks/useWarehouseOpsRange";

interface Props {
  anchorDate: Date;
  shifts: OpsShift[];
  scans: OpsScanEvent[];
  jobs: OpsJob[];
}

// Tidsaxel: 06:00–20:00 (14 h)
const HOUR_START = 6;
const HOUR_END = 20;
const HOURS_TOTAL = HOUR_END - HOUR_START;

interface StaffEntry {
  staffId: string;
  staffName: string;
  shiftStart: number | null; // mins from HOUR_START
  shiftEnd: number | null; // mins from HOUR_START (null = pågår)
  shiftHours: number;
  scanBuckets: number[]; // intensitet per 15-min slot (HOURS_TOTAL*4 buckets)
  jobsTouched: { name: string; percent: number }[];
  status: "active" | "idle" | "warn" | "off";
  lastScanMinsAgo: number | null;
}

function timeToMins(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const totalMin = (h - HOUR_START) * 60 + m;
  return Math.max(0, Math.min(HOURS_TOTAL * 60, totalMin));
}

const OpsStaffTimeline = ({ anchorDate, shifts, scans, jobs }: Props) => {
  const dayKey = format(anchorDate, "yyyy-MM-dd");
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const isToday = dayKey === todayKey;

  const entries = useMemo<StaffEntry[]>(() => {
    const byStaff = new Map<string, StaffEntry>();
    const jobNameMap = new Map<string, OpsJob>();
    for (const j of jobs) jobNameMap.set(j.id, j);

    // Init from shifts
    for (const sh of shifts) {
      if (sh.reportDate !== dayKey) continue;
      const start = timeToMins(sh.startTime);
      const end = timeToMins(sh.endTime);
      const existing = byStaff.get(sh.staffId);
      if (existing) {
        if (start !== null && (existing.shiftStart === null || start < existing.shiftStart))
          existing.shiftStart = start;
        if (end !== null && (existing.shiftEnd === null || end > existing.shiftEnd))
          existing.shiftEnd = end;
        existing.shiftHours += sh.hoursWorked;
      } else {
        byStaff.set(sh.staffId, {
          staffId: sh.staffId,
          staffName: sh.staffName,
          shiftStart: start,
          shiftEnd: sh.endTime ? end : null,
          shiftHours: sh.hoursWorked,
          scanBuckets: new Array(HOURS_TOTAL * 4).fill(0),
          jobsTouched: [],
          status: "off",
          lastScanMinsAgo: null,
        });
      }
    }

    // Add scan-based entries (folks som scannat utan time_report)
    const scansForDay = scans.filter((s) => s.createdAt.slice(0, 10) === dayKey);
    for (const s of scansForDay) {
      let entry = byStaff.get(s.staffId);
      if (!entry) {
        entry = {
          staffId: s.staffId,
          staffName: s.staffName || "Okänd",
          shiftStart: null,
          shiftEnd: null,
          shiftHours: 0,
          scanBuckets: new Array(HOURS_TOTAL * 4).fill(0),
          jobsTouched: [],
          status: "off",
          lastScanMinsAgo: null,
        };
        byStaff.set(s.staffId, entry);
      }
      const dt = parseISO(s.createdAt);
      const minsFromStart = (dt.getHours() - HOUR_START) * 60 + dt.getMinutes();
      const bucket = Math.floor(minsFromStart / 15);
      if (bucket >= 0 && bucket < entry.scanBuckets.length) {
        entry.scanBuckets[bucket] = (entry.scanBuckets[bucket] || 0) + 1;
      }
      // jobs touched
      const job = jobNameMap.get(s.packingId);
      if (job && !entry.jobsTouched.find((j) => j.name === (job.bookingNumber || job.name))) {
        entry.jobsTouched.push({
          name: job.bookingNumber || job.name,
          percent: job.percent,
        });
      }
    }

    // Status per person
    const now = new Date();
    for (const e of byStaff.values()) {
      // Senaste scan
      const last = scansForDay
        .filter((s) => s.staffId === e.staffId)
        .reduce<string | null>((acc, s) => (acc && acc > s.createdAt ? acc : s.createdAt), null);
      e.lastScanMinsAgo = last ? differenceInMinutes(now, parseISO(last)) : null;

      const stillOnShift = e.shiftStart !== null && e.shiftEnd === null;
      if (!isToday) {
        e.status = "off";
      } else if (e.lastScanMinsAgo !== null && e.lastScanMinsAgo <= 30) {
        e.status = "active";
      } else if (stillOnShift && (e.lastScanMinsAgo === null || e.lastScanMinsAgo > 120)) {
        e.status = e.shiftHours > 4 ? "warn" : "idle";
      } else if (stillOnShift) {
        e.status = "idle";
      } else {
        e.status = "off";
      }
    }

    return [...byStaff.values()].sort((a, b) => {
      const order: Record<StaffEntry["status"], number> = { active: 0, warn: 1, idle: 2, off: 3 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.shiftHours - a.shiftHours;
    });
  }, [shifts, scans, jobs, dayKey, isToday]);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
        Ingen lagerpersonal har skift eller scan-aktivitet för valt datum.
      </div>
    );
  }

  // Tidsmarkörer
  const hourMarks = Array.from({ length: HOURS_TOTAL + 1 }, (_, i) => i + HOUR_START);
  const nowMins = isToday
    ? Math.max(
        0,
        Math.min(
          HOURS_TOTAL * 60,
          (new Date().getHours() - HOUR_START) * 60 + new Date().getMinutes(),
        ),
      )
    : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60">
        <h2 className="text-sm font-semibold">Personalens dag</h2>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* tidsaxel */}
          <div className="grid grid-cols-[180px_1fr_220px] items-center px-4 py-1.5 text-[10px] font-medium uppercase text-muted-foreground border-b border-border/40">
            <span>Personal</span>
            <div className="relative h-4">
              {hourMarks.map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${((h - HOUR_START) / HOURS_TOTAL) * 100}%` }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              ))}
            </div>
            <span className="text-right">Idag</span>
          </div>

          {entries.map((e) => (
            <div
              key={e.staffId}
              className="grid grid-cols-[180px_1fr_220px] items-center px-4 py-2 border-b border-border/30 text-sm"
            >
              {/* Namn + status */}
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    e.status === "active" && "bg-emerald-500 animate-pulse",
                    e.status === "warn" && "bg-red-500",
                    e.status === "idle" && "bg-amber-500",
                    e.status === "off" && "bg-muted-foreground/40",
                  )}
                />
                <span className="font-medium truncate">{e.staffName}</span>
              </div>

              {/* Timeline */}
              <div className="relative h-7 bg-muted/30 rounded mx-2">
                {/* Hour gridlines */}
                {hourMarks.slice(1, -1).map((h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 w-px bg-border/40"
                    style={{ left: `${((h - HOUR_START) / HOURS_TOTAL) * 100}%` }}
                  />
                ))}

                {/* Skift-bar */}
                {e.shiftStart !== null && (
                  <div
                    className="absolute top-1 bottom-1 bg-warehouse/15 border border-warehouse/40 rounded"
                    style={{
                      left: `${(e.shiftStart / (HOURS_TOTAL * 60)) * 100}%`,
                      width: `${
                        (((e.shiftEnd ?? nowMins ?? e.shiftStart) - e.shiftStart) /
                          (HOURS_TOTAL * 60)) *
                        100
                      }%`,
                    }}
                  />
                )}

                {/* Scan-buckets */}
                {e.scanBuckets.map((count, idx) => {
                  if (count === 0) return null;
                  const intensity = Math.min(1, count / 6);
                  return (
                    <div
                      key={idx}
                      className="absolute top-1.5 bottom-1.5 rounded-sm bg-warehouse"
                      style={{
                        left: `${(idx / (HOURS_TOTAL * 4)) * 100}%`,
                        width: `${100 / (HOURS_TOTAL * 4)}%`,
                        opacity: 0.4 + intensity * 0.6,
                      }}
                      title={`${count} scan(s)`}
                    />
                  );
                })}

                {/* Now-line */}
                {nowMins !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                    style={{ left: `${(nowMins / (HOURS_TOTAL * 60)) * 100}%` }}
                  />
                )}
              </div>

              {/* Höger: jobb + tid */}
              <div className="text-right text-xs text-muted-foreground space-y-0.5 truncate">
                <div className="font-medium text-foreground">
                  {e.shiftHours > 0 ? `${e.shiftHours.toFixed(1)} h` : "—"}
                  {e.lastScanMinsAgo !== null && e.lastScanMinsAgo <= 30 && (
                    <span className="ml-1.5 text-emerald-600">●</span>
                  )}
                </div>
                <div className="truncate">
                  {e.jobsTouched.length === 0
                    ? "Inga scans"
                    : e.jobsTouched
                        .slice(0, 2)
                        .map((j) => `${j.name} (${j.percent}%)`)
                        .join(" → ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OpsStaffTimeline;
