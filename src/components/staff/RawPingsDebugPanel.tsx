import { useMemo, useState } from 'react';
import { Database, X, ChevronRight, ChevronDown, AlertTriangle, BatteryLow, BatteryCharging, Battery } from 'lucide-react';
import {
  useRawStaffPingsDebug,
  type RawPingStaffEntry,
} from '@/hooks/staff/useRawStaffPingsDebug';
import {
  buildReportDataGapDiagnosis,
  describeReportDataGapStatus,
  type ReportDataGapDiagnosis,
} from '@/lib/staff/reportDataGapDiagnostics';

interface Props {
  organizationId: string | null;
  date: string; // YYYY-MM-DD (Stockholm-day)
  /** Staff som faktiskt syns i rapport/Gantt-listan just nu. */
  shownStaffIds: string[];
  /** Namn-lookup för staff som inte finns i pings-svaret (för missing-listan). */
  shownStaffNames?: Record<string, string>;
  onClose: () => void;
}

type StatusKey = 'ok' | 'few' | 'gaps' | 'no_recent' | 'no_pings';

function statusOf(entry: RawPingStaffEntry, intervalEndMs: number): StatusKey {
  if (entry.pingCount === 0) return 'no_pings';
  if (entry.pingCount < 5) return 'few';
  const lastMs = new Date(entry.lastRecordedAt).getTime();
  if (intervalEndMs - lastMs > 2 * 3600_000) return 'no_recent';
  if ((entry.maxPingGapMinutes ?? 0) > 60) return 'gaps';
  return 'ok';
}

const STATUS_LABEL: Record<StatusKey, string> = {
  ok: 'OK',
  few: 'Few pings',
  gaps: 'Large gaps',
  no_recent: 'No recent ping',
  no_pings: 'No pings',
};
const STATUS_CLASS: Record<StatusKey, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  few: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  gaps: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  no_recent: 'bg-red-500/15 text-red-700 dark:text-red-300',
  no_pings: 'bg-muted text-muted-foreground',
};

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    month: '2-digit', day: '2-digit',
  });
}
function fmtAgeMin(iso: string | null, refMs: number) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const m = Math.round((refMs - t) / 60_000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} m`;
}
function fmtNum(n: number | null, digits = 0) {
  if (n == null) return '—';
  return n.toFixed(digits);
}

export function RawPingsDebugPanel({
  organizationId, date, shownStaffIds, shownStaffNames, onClose,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [withRows, setWithRows] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useRawStaffPingsDebug({
    organizationId,
    date,
    includeRows: withRows,
  });

  const intervalEndMs = useMemo(
    () => (data?.summary.intervalEnd ? new Date(data.summary.intervalEnd).getTime() : Date.now()),
    [data?.summary.intervalEnd],
  );

  // ─── Jämför rapportlistan mot pings-listan ─────────────────────────
  const comparison = useMemo(() => {
    const shown = new Set(shownStaffIds);
    const pingMap = new Map<string, RawPingStaffEntry>();
    for (const e of data?.perStaff ?? []) pingMap.set(e.staffId, e);

    const shownInReportAndHasPings: string[] = [];
    const shownInReportNoPings: string[] = [];
    const hasPingsButMissingFromReport: RawPingStaffEntry[] = [];

    for (const id of shown) {
      if (pingMap.has(id)) shownInReportAndHasPings.push(id);
      else shownInReportNoPings.push(id);
    }
    for (const [id, entry] of pingMap) {
      if (!shown.has(id)) hasPingsButMissingFromReport.push(entry);
    }
    // "noPingsAndNotShown" är inte uppmätbar härifrån (vi vet inte vilka som
    // existerar utan både att synas och att pinga). Vi lämnar det som 0.
    return {
      shownInReportAndHasPings,
      shownInReportNoPings,
      hasPingsButMissingFromReport,
    };
  }, [shownStaffIds, data?.perStaff]);

  // ─── Per-staff diagnos (pure helper) ────────────────────────────────
  const diagnosisByStaff = useMemo(() => {
    const shown = new Set(shownStaffIds);
    const map = new Map<string, ReportDataGapDiagnosis>();
    for (const e of data?.perStaff ?? []) {
      map.set(
        e.staffId,
        buildReportDataGapDiagnosis({
          staffId: e.staffId,
          staffName: e.staffName,
          date,
          rawPings: {
            rawPingCount: e.pingCount,
            firstRawPingAt: e.firstRecordedAt,
            lastRawPingAt: e.lastRecordedAt,
            maxRawGapMinutes: e.maxPingGapMinutes,
            gapCountOver15Min: e.gapCountOver15Min,
            gapCountOver60Min: e.gapCountOver60Min,
            medianAccuracy: e.medianAccuracy,
            p90Accuracy: e.p90Accuracy,
            lowBatteryBeforeGap: e.battery?.likelyBatteryRelatedSignalLoss,
            batteryDroppedFast: e.battery?.batteryDroppedFast,
            lastBatteryPercent: e.battery?.lastBatteryPercent ?? null,
          },
          appHealth: e.appHealth
            ? {
                lastAppSeenAt: e.appHealth.lastAppSeenAt,
                lastAppState: e.appHealth.lastAppState,
                lastHealthEventType: e.appHealth.lastEventType,
                lastBatteryPercent: e.appHealth.lastBatteryPercent,
                latestIsCharging: e.appHealth.lastIsCharging,
              }
            : null,
          reportChain: {
            isShownInReportList: shown.has(e.staffId),
          },
        }),
      );
    }
    return map;
  }, [data?.perStaff, shownStaffIds, date]);
  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] border-t border-border bg-card shadow-2xl flex flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/60 bg-muted/40">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" />
          Raw GPS — debug ({date})
          {isFetching && <span className="text-xs text-muted-foreground">laddar…</span>}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox" checked={withRows}
              onChange={(e) => setWithRows(e.target.checked)}
            />
            Inkludera rader
          </label>
          <button
            type="button" onClick={() => refetch()}
            className="h-7 px-2 text-xs rounded-md border border-border hover:bg-muted"
          >
            Uppdatera
          </button>
          <button
            type="button" onClick={onClose}
            className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-auto p-3 text-xs">
        {!organizationId && (
          <div className="text-muted-foreground">Ingen organisation — kan inte hämta.</div>
        )}
        {error && (
          <div className="text-red-600">Fel: {(error as Error).message}</div>
        )}
        {isLoading && <div className="text-muted-foreground">Laddar pings…</div>}

        {data && (
          <>
            <div className="mb-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              <SummaryStat label="Personal med pings" value={data.summary.totalStaffWithPings} />
              <SummaryStat label="Totalt antal pings" value={data.summary.totalPingCount} />
              <SummaryStat label="Tidigaste" value={fmtTime(data.summary.earliestPingAt)} mono />
              <SummaryStat label="Senaste" value={fmtTime(data.summary.latestPingAt)} mono />
              <SummaryStat label="Få pings (<5)" value={data.summary.staffWithOnlyFewPings.length} />
              <SummaryStat label="Stora gap (>60m)" value={data.summary.staffWithLargeGaps.length} />
              <SummaryStat label="Ingen recent ping" value={data.summary.staffWithNoRecentPing.length} />
              <SummaryStat label="Tz" value={data.summary.timezoneUsed} mono />
            </div>

            {/* Jämförelse rapport ↔ pings */}
            <div className="mb-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              <SummaryStat label="Syns i rapport + har pings" value={comparison.shownInReportAndHasPings.length} />
              <SummaryStat label="Syns i rapport, inga pings" value={comparison.shownInReportNoPings.length} />
              <SummaryStat label="Har pings men saknas" value={comparison.hasPingsButMissingFromReport.length} />
            </div>

            {comparison.hasPingsButMissingFromReport.length > 0 && (
              <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-2">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-semibold mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  {comparison.hasPingsButMissingFromReport.length} personer har GPS-pings men finns inte i rapportlistan.
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-red-700/80 dark:text-red-300/80">
                      <th className="px-2 py-1">Personal</th>
                      <th className="px-2 py-1 text-right">Pings</th>
                      <th className="px-2 py-1">Första</th>
                      <th className="px-2 py-1">Sista</th>
                      <th className="px-2 py-1 text-right">Max gap (m)</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.hasPingsButMissingFromReport.map(m => (
                      <tr key={m.staffId} className="border-t border-red-500/20">
                        <td className="px-2 py-1">
                          <div className="font-medium">
                            {m.staffName ?? shownStaffNames?.[m.staffId] ?? '—'}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">{m.staffId}</div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{m.pingCount}</td>
                        <td className="px-2 py-1 font-mono">{fmtTime(m.firstRecordedAt)}</td>
                        <td className="px-2 py-1 font-mono">{fmtTime(m.lastRecordedAt)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtNum(m.maxPingGapMinutes, 0)}</td>
                        <td className="px-2 py-1">
                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] bg-red-500/20 text-red-700 dark:text-red-300">
                            Saknas i rapport
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.diagnostics.warnings.length > 0 && (
              <div className="mb-2 text-amber-700 dark:text-amber-300">
                ⚠ {data.diagnostics.warnings.join(' · ')}
              </div>
            )}


            <table className="w-full border-collapse">
              <thead className="bg-muted/60 sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1"></th>
                  <th className="px-2 py-1">Personal</th>
                  <th className="px-2 py-1 text-right">Pings</th>
                  <th className="px-2 py-1">Första</th>
                  <th className="px-2 py-1">Sista</th>
                  <th className="px-2 py-1 text-right">Max gap (m)</th>
                  <th className="px-2 py-1 text-right">&gt;15</th>
                  <th className="px-2 py-1 text-right">&gt;60</th>
                  <th className="px-2 py-1 text-right">Med acc</th>
                  <th className="px-2 py-1 text-right">P90 acc</th>
                  <th className="px-2 py-1 text-right">Sista age</th>
                  <th className="px-2 py-1">Batteri</th>
                  <th className="px-2 py-1">App senast</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Diagnos</th>
                </tr>
              </thead>
              <tbody>
                {data.perStaff.map((s) => {
                  const isOpen = expanded.has(s.staffId);
                  const status = statusOf(s, intervalEndMs);
                  const diag = diagnosisByStaff.get(s.staffId);
                  return (
                    <>
                      <tr
                        key={s.staffId}
                        className="border-t border-border/40 hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggle(s.staffId)}
                      >
                        <td className="px-2 py-1">
                          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </td>
                        <td className="px-2 py-1">
                          <div className="font-medium">{s.staffName ?? '—'}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{s.staffId}</div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{s.pingCount}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{fmtTime(s.firstRecordedAt)}</td>
                        <td className="px-2 py-1 font-mono text-[11px]">{fmtTime(s.lastRecordedAt)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtNum(s.maxPingGapMinutes, 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{s.gapCountOver15Min}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{s.gapCountOver60Min}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtNum(s.medianAccuracy, 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtNum(s.p90Accuracy, 0)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtAgeMin(s.lastRecordedAt, intervalEndMs)}</td>
                        <td className="px-2 py-1"><BatteryCell battery={s.battery} /></td>
                        <td className="px-2 py-1"><AppHealthCell appHealth={s.appHealth} intervalEndMs={intervalEndMs} /></td>
                        <td className="px-2 py-1">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${STATUS_CLASS[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-2 py-1"><DiagnosisBadge diag={diag} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/20">
                          <td colSpan={15} className="px-2 py-2">
                            {diag && (
                              <div className="mb-2 text-[11px]">
                                <span className="font-semibold">Diagnos: </span>
                                <span>{describeReportDataGapStatus(diag.status)}</span>
                                <span className="text-muted-foreground"> — {diag.reason}</span>
                                {diag.suggestedNextAction !== 'none' && (
                                  <span className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] font-mono">
                                    next: {diag.suggestedNextAction}
                                  </span>
                                )}
                              </div>
                            )}
                            <BatterySummaryDetail battery={s.battery} />
                            <AppHealthDetail appHealth={s.appHealth} />
                            <SampleRowsTable rows={s.sampleRows} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {data.perStaff.length === 0 && (
                  <tr><td colSpan={15} className="px-2 py-6 text-center text-muted-foreground">
                    Inga pings för intervallet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : 'font-semibold tabular-nums'}`}>{value}</div>
    </div>
  );
}

function SampleRowsTable({ rows }: { rows: ReturnType<typeof Array.prototype.slice> & any[] }) {
  if (!rows || rows.length === 0) {
    return <div className="text-muted-foreground">Inga sample-rader.</div>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="px-2 py-1">recorded_at</th>
            <th className="px-2 py-1">created_at</th>
            <th className="px-2 py-1 text-right">lat</th>
            <th className="px-2 py-1 text-right">lng</th>
            <th className="px-2 py-1 text-right">acc</th>
            <th className="px-2 py-1 text-right">speed</th>
            <th className="px-2 py-1 text-right">batt %</th>
            <th className="px-2 py-1">laddar</th>
            <th className="px-2 py-1">batt källa</th>
            <th className="px-2 py-1">time_report_id</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} className="border-t border-border/30">
              <td className="px-2 py-0.5 font-mono">{fmtTime(r.recorded_at)}</td>
              <td className="px-2 py-0.5 font-mono">{fmtTime(r.created_at)}</td>
              <td className="px-2 py-0.5 text-right font-mono">{r.latitude?.toFixed?.(5) ?? '—'}</td>
              <td className="px-2 py-0.5 text-right font-mono">{r.longitude?.toFixed?.(5) ?? '—'}</td>
              <td className="px-2 py-0.5 text-right">{r.accuracy != null ? Math.round(r.accuracy) : '—'}</td>
              <td className="px-2 py-0.5 text-right">{r.speed_mps ?? '—'}</td>
              <td className="px-2 py-0.5 text-right tabular-nums">{r.battery_percent != null ? `${r.battery_percent}%` : '—'}</td>
              <td className="px-2 py-0.5">{r.is_charging == null ? '—' : (r.is_charging ? 'ja' : 'nej')}</td>
              <td className="px-2 py-0.5 text-[10px] text-muted-foreground">{r.battery_source ?? '—'}</td>
              <td className="px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{r.time_report_id ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BatteryCell({ battery }: { battery?: import('@/hooks/staff/useRawStaffPingsDebug').RawPingBatterySummary }) {
  if (!battery || battery.batterySamplesCount === 0) {
    return <span className="text-[10px] text-muted-foreground">Ingen batteridata</span>;
  }
  const last = battery.lastBatteryPercent;
  const min = battery.minBatteryPercent;
  const Icon = battery.latestIsCharging
    ? BatteryCharging
    : (last != null && last <= 10 ? BatteryLow : Battery);
  const tone =
    battery.likelyBatteryRelatedSignalLoss ? 'text-red-700 dark:text-red-300' :
    (last != null && last <= 15) ? 'text-amber-700 dark:text-amber-300' :
    'text-foreground';
  return (
    <div className={`flex flex-col gap-0.5 ${tone}`}>
      <div className="flex items-center gap-1 text-[11px] tabular-nums">
        <Icon className="h-3 w-3" />
        <span>{last != null ? `${last}%` : '—'}</span>
        <span className="text-[10px] text-muted-foreground">min {min ?? '—'}%</span>
      </div>
      <div className="flex flex-wrap gap-1 text-[9px]">
        {battery.batteryDroppedFast && (
          <span className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1">snabbt fall</span>
        )}
        {battery.likelyBatteryRelatedSignalLoss && (
          <span className="rounded bg-red-500/20 text-red-700 dark:text-red-300 px-1">trolig batterisignalförlust</span>
        )}
        {battery.missingBatterySamplesCount > 0 && (
          <span className="rounded bg-muted text-muted-foreground px-1">
            {battery.batterySamplesCount}/{battery.batterySamplesCount + battery.missingBatterySamplesCount} m. batt
          </span>
        )}
      </div>
    </div>
  );
}

function BatterySummaryDetail({ battery }: { battery?: import('@/hooks/staff/useRawStaffPingsDebug').RawPingBatterySummary }) {
  if (!battery || battery.batterySamplesCount === 0) {
    return (
      <div className="mb-2 text-[11px] text-muted-foreground">Ingen batteridata på dagens pings.</div>
    );
  }
  return (
    <div className="mb-2 grid grid-cols-2 md:grid-cols-5 gap-1 text-[11px]">
      <Stat k="Första" v={`${battery.firstBatteryPercent ?? '—'}%`} />
      <Stat k="Sista" v={`${battery.lastBatteryPercent ?? '—'}%`} />
      <Stat k="Min" v={`${battery.minBatteryPercent ?? '—'}%`} />
      <Stat k="Max" v={`${battery.maxBatteryPercent ?? '—'}%`} />
      <Stat k="Laddar" v={battery.latestIsCharging == null ? '—' : (battery.latestIsCharging ? 'ja' : 'nej')} />
      <Stat k="Batt-samples" v={String(battery.batterySamplesCount)} />
      <Stat k="Utan batt-data" v={String(battery.missingBatterySamplesCount)} />
      <Stat k="Snabbt fall" v={battery.batteryDroppedFast ? 'ja' : 'nej'} />
      <Stat k="Trolig batt-signalförlust" v={battery.likelyBatteryRelatedSignalLoss ? 'ja' : 'nej'} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-border/40 bg-background px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="font-mono tabular-nums">{v}</div>
    </div>
  );
}

type AppHealth = NonNullable<import('@/hooks/staff/useRawStaffPingsDebug').RawPingStaffEntry['appHealth']>;

function fmtAge(iso: string | null | undefined, refMs: number): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const min = Math.max(0, Math.round((refMs - t) / 60_000));
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

function AppHealthCell({
  appHealth,
  intervalEndMs,
}: { appHealth: AppHealth | null | undefined; intervalEndMs: number }) {
  if (!appHealth) return <span className="text-[10px] text-muted-foreground">—</span>;
  const pct = appHealth.lastBatteryPercent;
  const source = appHealth.lastAppSeenSource ?? '';
  const isFallback = source === 'gps_ping' || source === 'staff_locations';
  return (
    <div className="flex flex-col gap-0.5 text-[10px]">
      <span className="font-mono">{fmtAge(appHealth.lastAppSeenAt, intervalEndMs)} sen</span>
      <span className="text-muted-foreground">
        {appHealth.lastEventType}
        {pct != null ? ` · ${pct}%` : ''}
        {appHealth.lastIsCharging === true ? ' ⚡' : ''}
      </span>
      {appHealth.heartbeatMissing ? (
        <span
          className="rounded bg-amber-500/15 px-1 py-0.5 font-medium text-amber-700 dark:text-amber-300"
          title="Telefonen pingar GPS men skickar inga app health-events. Troligen en gammal app-build utan heartbeat-telemetri."
        >
          Heartbeat saknas
        </span>
      ) : null}
      {isFallback && !appHealth.heartbeatMissing ? (
        <span className="text-[9px] text-muted-foreground italic" title={`Källa: ${source}`}>
          via {source === 'gps_ping' ? 'GPS' : 'staff_locations'}
        </span>
      ) : null}
    </div>
  );
}

function AppHealthDetail({ appHealth }: { appHealth: AppHealth | null | undefined }) {
  if (!appHealth) {
    return <div className="mb-2 text-[11px] text-muted-foreground">Inga app health-events.</div>;
  }
  const buildStatus = classifyAppBuild(appHealth.lastAppBuild);
  const badgeClass =
    buildStatus === 'ok'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : buildStatus === 'outdated'
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : 'bg-red-500/20 text-red-700 dark:text-red-300';
  const badgeText =
    buildStatus === 'ok'
      ? 'Build OK'
      : buildStatus === 'outdated'
        ? `Gammal build — väntat ${CURRENT_EXPECTED_APP_BUILD}`
        : 'Version saknas — installera om';
  return (
    <div className="mb-2 space-y-2">
      <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-4">
        <Stat k="Senaste app-event" v={appHealth.lastEventType} />
        <Stat k="Tid" v={appHealth.lastAppSeenAt} />
        <Stat k="Källa" v={appHealth.lastAppSeenSource ?? 'health'} />
        <Stat k="Heartbeat" v={appHealth.heartbeatMissing ? 'SAKNAS' : 'OK'} />
        <Stat k="App-state" v={appHealth.lastAppState ?? '—'} />
        <Stat k="Batt %" v={appHealth.lastBatteryPercent != null ? `${appHealth.lastBatteryPercent}%` : '—'} />
        <Stat k="Laddar" v={appHealth.lastIsCharging == null ? '—' : appHealth.lastIsCharging ? 'ja' : 'nej'} />
        <Stat k="Plattform" v={appHealth.lastPlatform ?? '—'} />
        <Stat k="App-version" v={appHealth.lastAppVersion ?? '—'} />
        <Stat k="Build" v={appHealth.lastAppBuild ?? '—'} />
        <Stat k="OS" v={appHealth.lastOsVersion ?? '—'} />
        <Stat k="Device" v={appHealth.lastDeviceModel ?? '—'} />
        <Stat k="App ID" v={appHealth.lastAppId ?? '—'} />
        <Stat k="Senaste health" v={fmtTime(appHealth.lastAppHealthAt ?? null)} />
        <Stat k="Senaste GPS" v={fmtTime(appHealth.lastGpsAt ?? null)} />
      </div>
      <div>
        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
          {badgeText}
        </span>
      </div>
    </div>
  );
}

const DIAG_TONE: Record<ReportDataGapDiagnosis['severity'], string> = {
  info: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  critical: 'bg-red-500/20 text-red-700 dark:text-red-300',
};

function DiagnosisBadge({ diag }: { diag: ReportDataGapDiagnosis | undefined }) {
  if (!diag) return <span className="text-[10px] text-muted-foreground">—</span>;
  const label = describeReportDataGapStatus(diag.status);
  const tone = diag.status === 'ok' ? DIAG_TONE.info : DIAG_TONE[diag.severity];
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${tone}`}
      title={diag.reason}
    >
      {label}
    </span>
  );
}

export default RawPingsDebugPanel;
