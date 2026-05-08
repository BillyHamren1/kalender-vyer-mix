import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2, Play, AlertTriangle, Copy, Check, CheckCircle2, XCircle,
  AlertCircle, ArrowRight, Plus, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type StatusTone = "ok" | "warn" | "bad" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  bad: "bg-destructive/15 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(iso);
  }
}

function ageMinutes(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 60000);
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}
function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function StatusPill({ tone, label, detail }: { tone: StatusTone; label: string; detail?: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : AlertCircle;
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${TONE_CLASS[tone]}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {detail && <div className="opacity-80 truncate">{detail}</div>}
      </div>
    </div>
  );
}

function StatusGrid({ result }: { result: any }) {
  const raw = result?.rawData ?? {};
  const tm = result?.targetMatches ?? {};
  const ww = Array.isArray(result?.wouldWrite) ? result.wouldWrite : (result?.wouldWrite?.actions ?? []);
  const snap = result?.snapshotPreview ?? {};
  const pingCount = raw?.pingCount ?? raw?.pings?.length ?? 0;
  const lastPing = raw?.lastPingAt ?? null;
  const lastAge = ageMinutes(lastPing);
  const openLte = raw?.openLocationTimeEntry ?? null;
  const targetHit = ["warehouse", "booking", "large_project", "project_location"].some(
    (k) => Array.isArray(tm?.[k]) ? tm[k].length > 0 : (tm?.[k]?.firstMatchAt || tm?.[k]?.lastMatchAt)
  );
  const detectedTarget = result?.detectedState?.targetKey ?? result?.detectedState?.target?.key ?? null;
  const snapActive = snap?.active?.label ?? snap?.activeKey ?? null;
  const hasClose = ww.some?.((a: any) => /close/i.test(a?.action ?? a?.type ?? ""));
  const hasTransport = ww.some?.((a: any) => /transport|travel/i.test(a?.action ?? a?.type ?? ""));
  const hasOpen = ww.some?.((a: any) => /^open|start_lte|create_lte/i.test(a?.action ?? a?.type ?? ""));

  const items: Array<{ tone: StatusTone; label: string; detail?: string }> = [
    pingCount > 0
      ? { tone: "ok", label: `Pings (${pingCount})`, detail: `Senaste: ${fmtTime(lastPing)}` }
      : { tone: "bad", label: "Inga pings" },
    lastAge == null
      ? { tone: "neutral", label: "Ping-ålder okänd" }
      : lastAge <= 10 ? { tone: "ok", label: "Ping färsk", detail: `${lastAge} min` }
      : lastAge <= 30 ? { tone: "warn", label: "Ping börjar bli gammal", detail: `${lastAge} min` }
      : { tone: "bad", label: "Ping för gammal", detail: `${lastAge} min` },
    targetHit
      ? { tone: "ok", label: "Target match hittad", detail: detectedTarget ?? "" }
      : { tone: "bad", label: "Ingen target match" },
    openLte
      ? { tone: "ok", label: "Aktiv LTE", detail: openLte?.label ?? openLte?.location_id ?? "öppen" }
      : { tone: "warn", label: "Ingen aktiv LTE" },
    hasClose ? { tone: "ok", label: "Skulle stänga plats" } : { tone: "neutral", label: "Ingen CLOSE" },
    hasTransport ? { tone: "ok", label: "Skulle skapa transport" } : { tone: "neutral", label: "Ingen transport" },
    hasOpen ? { tone: "ok", label: "Skulle öppna plats" } : { tone: "neutral", label: "Ingen OPEN" },
    snapActive
      ? { tone: "ok", label: "Snapshot active", detail: String(snapActive) }
      : { tone: "warn", label: "Snapshot saknar active" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Status</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {items.map((it, i) => <StatusPill key={i} {...it} />)}
        </div>
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Time Engine Dry-Run Summary (kompakt vy + readiness-status)
 * Läser endast nya engine-fält. Ingen workday/time_report/LTE.
 * ─────────────────────────────────────────────────────────────────────── */

function buildTimeEngineSummary(result: any) {
  const r = result ?? {};
  const cov = r.rawPingsCoverage ?? {};
  const tl = r.gpsDayTimeline ?? {};
  const segs: any[] = Array.isArray(tl.segments) ? tl.segments : [];
  const stays = segs.filter((s) => s?.kind === "stay");
  const knownStays = stays.filter((s) => s?.type === "known_site");
  const unknownStays = stays.filter((s) => s?.type === "unknown_place");
  const travels = segs.filter((s) => s?.kind === "travel");
  const gaps = segs.filter((s) => s?.kind === "gps_gap");

  const decisions: any[] = Array.isArray(r.autoStartDecisions) ? r.autoStartDecisions : [];
  const allowed = decisions.filter((d) => d?.allowed);
  const blocked = decisions.filter((d) => !d?.allowed);

  const warnings: string[] = Array.isArray(r.warnings) ? r.warnings : [];
  const leak = r.legacyLeakCheck ?? {};
  const legacyLeakDetected =
    !!leak.inputLegacySourceLeakDetected || !!leak.forbiddenTableLeakDetected;

  const preview = r.activeTimeRegistrationPreview ?? null;

  // Backend is authoritative for readiness, targetSummary and allowedDecisions.
  const backendTargetSummary = r.targetSummary ?? null;
  const backendAutoSummary = r.autoStartSummary ?? {};
  const backendAllowedDecisions: any[] = Array.isArray(backendAutoSummary.allowedDecisions)
    ? backendAutoSummary.allowedDecisions
    : [];

  const targetSummaryComplete =
    !!backendTargetSummary &&
    Number.isFinite(Number(backendTargetSummary.totalCandidates)) &&
    Number.isFinite(Number(backendTargetSummary.validCount)) &&
    Number.isFinite(Number(backendTargetSummary.invalidCount)) &&
    Number.isFinite(Number(backendTargetSummary.candidatesWithCoordinates)) &&
    Number.isFinite(Number(backendTargetSummary.autostartableCount)) &&
    backendTargetSummary.excludedByReason != null &&
    typeof backendTargetSummary.excludedByReason === "object";

  const allowedDecisionsComplete =
    backendAllowedDecisions.length > 0 &&
    backendAllowedDecisions.every(
      (d) =>
        d?.startAt != null &&
        d?.targetName != null &&
        d?.targetType != null &&
        d?.targetLabel != null &&
        d?.dwellSeconds != null &&
        d?.arrivalPingsCount != null,
    );

  const previewWouldCreate = preview?.wouldCreateActiveRegistration === true;

  const ready =
    warnings.length === 0 &&
    !legacyLeakDetected &&
    previewWouldCreate &&
    targetSummaryComplete &&
    Number(backendTargetSummary?.validCount ?? 0) > 0 &&
    Number(backendTargetSummary?.totalCandidates ?? 0) > 0 &&
    Number(backendAutoSummary?.allowedCount ?? 0) > 0 &&
    allowedDecisionsComplete;

  const notReadyReason = !ready
    ? (!targetSummaryComplete
        ? "target_summary_missing"
        : !allowedDecisionsComplete
          ? "allowed_decision_missing_evidence"
          : !previewWouldCreate
            ? "preview_would_not_create"
            : warnings.length > 0
              ? "warnings_present"
              : legacyLeakDetected
                ? "legacy_leak_detected"
                : "not_ready")
    : null;

  return {
    status: ready ? "READY_TO_CONFIRM" : "NOT_READY",
    notReadyReason,
    rawPingsCoverage: {
      rawPingCount: cov.pingCount ?? 0,
      firstPingAt: cov.firstPingAt ?? null,
      lastPingAt: cov.lastPingAt ?? null,
    },
    gpsSummary: {
      gpsDayTimelineCount: segs.length,
      stayCount: stays.length,
      knownStayCount: knownStays.length,
      unknownStayCount: unknownStays.length,
      travelCount: travels.length,
      gpsGapCount: gaps.length,
      sampleSegments: segs.slice(0, 10).map((s) => ({
        id: s.id, kind: s.kind, type: s.type,
        startTs: s.startTs, endTs: s.endTs,
        durationMin: s.durationMin, label: s.label,
      })),
    },
    targetSummary: backendTargetSummary,
    autoStartSummary: (() => {
      const blockedByReason: Record<string, number> = {};
      for (const d of blocked) {
        const k = String(d?.reason ?? "unknown");
        blockedByReason[k] = (blockedByReason[k] ?? 0) + 1;
      }
      const cnt = (re: RegExp) =>
        Object.entries(blockedByReason).reduce((sum, [k, v]) => sum + (re.test(k) ? v : 0), 0);
      return {
        total: decisions.length,
        allowedCount: allowed.length,
        blockedCount: blocked.length,
        blockedUnknownPlaceCount: cnt(/unknown_place/i),
        blockedTransportCount: cnt(/transport/i),
        blockedGpsGapCount: cnt(/gps_gap/i),
        blockedInvalidTargetCount: cnt(/invalid_target|missing_coordinates|invalid_radius|test_data|cancelled|archived/i),
        blockedNightPolicyCount: cnt(/night/i),
        blockedByReason,
        allowedDecisions: backendAllowedDecisions.map((d: any) => ({
          startAt: d.startAt ?? null,
          targetName: d.targetName ?? null,
          targetType: d.targetType ?? null,
          segmentLabel: d.segmentLabel ?? null,
          targetLabel: d.targetLabel ?? d.targetName ?? null,
          reason: d.reason,
          confidence: d.confidence,
          dwellSeconds: d.dwellSeconds ?? null,
          arrivalPingsCount: d.arrivalPingsCount ?? null,
        })),
        blockedExamples: blocked.slice(0, 10).map((d) => ({
          segmentLabel: d.segmentLabel,
          targetLabel: d.matchedTarget?.name ?? null,
          reason: d.reason,
          confidence: d.confidence,
        })),
      };
    })(),
    activeTimeRegistrationPreview: preview ? {
      wouldCreateActiveRegistration: !!preview.wouldCreate,
      startAt: preview.startAt ?? null,
      startSource: preview.startSource ?? null,
      targetLabel: preview.targetLabel ?? null,
      reason: preview.reason ?? null,
    } : null,
    warnings,
    legacyLeakCheck: {
      legacyLeakDetected,
      forbiddenTableReads: Array.isArray(leak.forbiddenTableReadsObserved)
        ? leak.forbiddenTableReadsObserved.map((x: any) => x.table)
        : [],
      inputLegacySources: leak.inputLegacySources ?? [],
    },
  };
}

function TimeEngineDryRunSummary({ result }: { result: any }) {
  const s = useMemo(() => buildTimeEngineSummary(result), [result]);
  const ready = s.status === "READY_TO_CONFIRM";
  const tone: StatusTone = ready ? "ok" : "bad";
  const Icon = ready ? CheckCircle2 : XCircle;
  const cov = s.rawPingsCoverage;
  const gps = s.gpsSummary;
  const auto = s.autoStartSummary;
  const preview = s.activeTimeRegistrationPreview;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Time Engine — torrkörningssammanfattning</CardTitle>
        <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>
          <Icon className="h-4 w-4" />
          {s.status}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">1. Data in</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div><div className="text-muted-foreground">rawPingCount</div><div className="font-mono">{cov.rawPingCount}</div></div>
            <div><div className="text-muted-foreground">firstPingAt</div><div className="font-mono">{fmtTime(cov.firstPingAt)}</div></div>
            <div><div className="text-muted-foreground">lastPingAt</div><div className="font-mono">{fmtTime(cov.lastPingAt)}</div></div>
            <div><div className="text-muted-foreground">warnings</div><div className="font-mono">{s.warnings.length}</div></div>
            <div><div className="text-muted-foreground">legacyLeak</div><div className={`font-mono ${s.legacyLeakCheck.legacyLeakDetected ? "text-destructive" : ""}`}>{String(s.legacyLeakCheck.legacyLeakDetected)}</div></div>
          </div>
          {s.warnings.length > 0 && (
            <ul className="mt-2 text-xs text-amber-700 dark:text-amber-400 list-disc list-inside">
              {s.warnings.slice(0, 8).map((w, i) => <li key={i} className="font-mono">{w}</li>)}
            </ul>
          )}
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">2. GPS-tidslinje</h4>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <div><div className="text-muted-foreground">total</div><div className="font-mono">{gps.gpsDayTimelineCount}</div></div>
            <div><div className="text-muted-foreground">stay</div><div className="font-mono">{gps.stayCount}</div></div>
            <div><div className="text-muted-foreground">known</div><div className="font-mono">{gps.knownStayCount}</div></div>
            <div><div className="text-muted-foreground">unknown</div><div className="font-mono">{gps.unknownStayCount}</div></div>
            <div><div className="text-muted-foreground">travel</div><div className="font-mono">{gps.travelCount}</div></div>
            <div><div className="text-muted-foreground">gps_gap</div><div className="font-mono">{gps.gpsGapCount}</div></div>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
            3. Auto-start check ({auto.allowedCount} allowed / {auto.blockedCount} blocked)
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs mb-2">
            <div><div className="text-muted-foreground">allowed</div><div className="font-mono">{auto.allowedCount}</div></div>
            <div><div className="text-muted-foreground">unknown_place</div><div className="font-mono">{auto.blockedUnknownPlaceCount}</div></div>
            <div><div className="text-muted-foreground">transport</div><div className="font-mono">{auto.blockedTransportCount}</div></div>
            <div><div className="text-muted-foreground">gps_gap</div><div className="font-mono">{auto.blockedGpsGapCount}</div></div>
            <div><div className="text-muted-foreground">invalid_target</div><div className="font-mono">{auto.blockedInvalidTargetCount}</div></div>
            <div><div className="text-muted-foreground">night_policy</div><div className="font-mono">{auto.blockedNightPolicyCount}</div></div>
          </div>
          <p className={`text-xs mb-2 font-medium ${auto.allowedCount > 0 ? "text-emerald-600" : "text-amber-700 dark:text-amber-400"}`}>
            {auto.allowedCount > 0
              ? "GPS får starta tid på giltig arbetsplats."
              : "Ingen giltig geofence-start hittades."}
          </p>
          {auto.allowedDecisions.length === 0 && auto.blockedCount === 0 ? (
            <p className="text-xs text-muted-foreground">Inga relevanta beslut.</p>
          ) : (
            <div className="space-y-1 text-xs">
              {auto.allowedDecisions.map((d: any, i: number) => (
                <div key={`a${i}`} className={`rounded border px-2 py-1 ${TONE_CLASS.ok}`}>
                  <div className="font-semibold">
                    ALLOWED · {d.targetName ?? d.targetLabel ?? "—"}{" "}
                    <span className="font-normal text-muted-foreground">({d.targetType ?? "—"})</span>
                  </div>
                  <div className="font-mono text-[11px]">
                    startAt={fmtTime(d.startAt)} · reason={d.reason} · conf={typeof d.confidence === "number" ? d.confidence.toFixed(2) : d.confidence} · dwell={d.dwellSeconds ?? "—"}s · arrivalPings={d.arrivalPingsCount ?? "—"}
                  </div>
                </div>
              ))}
              {Object.entries(auto.blockedByReason ?? {}).length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-muted-foreground">Blocked grupperat per reason:</div>
                  {Object.entries(auto.blockedByReason ?? {})
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .map(([reason, count]) => (
                      <div key={reason} className={`rounded border px-2 py-1 ${TONE_CLASS.warn}`}>
                        <span className="font-semibold">BLOCKED</span> · <span className="font-mono">{reason}</span> · <span className="font-mono">{count as number}st</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">4. active_time_registration preview</h4>
          {preview ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div><div className="text-muted-foreground">wouldCreate</div><div className={`font-mono ${preview.wouldCreateActiveRegistration ? "text-emerald-600" : ""}`}>{String(preview.wouldCreateActiveRegistration)}</div></div>
              <div><div className="text-muted-foreground">startAt</div><div className="font-mono">{fmtTime(preview.startAt)}</div></div>
              <div><div className="text-muted-foreground">startSource</div><div className="font-mono">{preview.startSource ?? "—"}</div></div>
              <div><div className="text-muted-foreground">targetLabel</div><div className="font-mono truncate">{preview.targetLabel ?? "—"}</div></div>
              <div className="col-span-2 md:col-span-5"><div className="text-muted-foreground">reason</div><div className="font-mono">{preview.reason ?? "—"}</div></div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Ingen preview.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function actionIcon(action: string) {
  if (/close/i.test(action)) return <X className="h-4 w-4" />;
  if (/transport|travel/i.test(action)) return <ArrowRight className="h-4 w-4" />;
  if (/open|start_lte|create_lte/i.test(action)) return <Plus className="h-4 w-4" />;
  if (/snapshot|rebuild/i.test(action)) return <RefreshCw className="h-4 w-4" />;
  return <CheckCircle2 className="h-4 w-4" />;
}

function actionTone(action: string): StatusTone {
  if (/close/i.test(action)) return "warn";
  if (/transport|travel/i.test(action)) return "ok";
  if (/open|start_lte|create_lte/i.test(action)) return "ok";
  if (/stale|wake/i.test(action)) return "warn";
  return "neutral";
}

function formatActionLine(a: any): string {
  const act = String(a?.action ?? a?.type ?? "ACTION").toUpperCase();
  const label = a?.label ?? a?.target ?? a?.targetKey ?? "";
  const t1 = a?.at ?? a?.start ?? a?.startedAt;
  const t2 = a?.end ?? a?.endedAt;
  if (/transport|travel/i.test(act)) return `CREATE TRANSPORT: ${fmtTime(t1)}–${fmtTime(t2)}`;
  if (/close/i.test(act)) return `CLOSE: ${label || "—"}${t1 ? ` at ${fmtTime(t1)}` : ""}`;
  if (/open|start_lte|create_lte/i.test(act)) return `OPEN: ${label || "—"}${t1 ? ` at ${fmtTime(t1)}` : ""}`;
  if (/snapshot|rebuild/i.test(act)) return "REBUILD SNAPSHOT";
  if (/stale/i.test(act)) return "MARK SIGNAL_STALE";
  if (/wake/i.test(act)) return "REQUEST WAKE PING";
  return `${act}${label ? `: ${label}` : ""}${t1 ? ` at ${fmtTime(t1)}` : ""}`;
}

/** Hela dagens tidslinje, rad för rad. */
function DayTimeline({ result }: { result: any }) {
  const segments: any[] = result?.segmentPreview ?? result?.snapshotPreview?.segments ?? [];
  const ww: any[] = Array.isArray(result?.wouldWrite) ? result.wouldWrite : (result?.wouldWrite?.actions ?? []);
  const warnings: any[] = Array.isArray(result?.warnings) ? result.warnings : [];

  if (!segments.length) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Hela dagens tidslinje</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Motorn returnerade inga segment för dagen.</p></CardContent>
      </Card>
    );
  }

  const findActionAt = (start?: string, end?: string) => {
    if (!start) return undefined;
    return ww.find((a) => {
      const at = a?.at ?? a?.start ?? a?.startedAt;
      if (!at) return false;
      const t = new Date(at).getTime();
      const s = new Date(start).getTime();
      const e = end ? new Date(end).getTime() : s + 60_000;
      return t >= s - 60_000 && t <= e + 60_000;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Hela dagens tidslinje ({segments.length} segment)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-muted-foreground border-b">
              <tr className="text-left">
                <th className="py-2 pr-3">Tid</th>
                <th className="py-2 pr-3">Plats / typ</th>
                <th className="py-2 pr-3">Källa</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Conf.</th>
                <th className="py-2 pr-3">Skulle skriva</th>
                <th className="py-2 pr-3">Varning</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((s, i) => {
                const start = s.startTs ?? s.start ?? s.from;
                const end = s.endTs ?? s.end ?? s.to;
                const label = s.label ?? s.matchedSiteName ?? s.matchedPlace?.name ?? s.kind ?? s.type ?? "—";
                const type = s.type ?? s.kind ?? (s.isStationary === false ? "travel" : "stay");
                const source = s.source ?? s.matchedSiteType ?? "—";
                const status = s.status ?? (end ? "klar" : "pågår");
                const conf = s.confidence != null ? `${Math.round(Number(s.confidence) * 100)}%` : "—";
                const action = findActionAt(start, end);
                const warn = (s.warnings ?? s.warning ?? warnings.find((w: any) =>
                  w?.segmentIndex === i || w?.at === start
                )) ?? null;
                const tone: StatusTone =
                  /travel|transport/i.test(type) ? "warn" :
                  !end ? "ok" :
                  label === "—" ? "bad" : "neutral";
                return (
                  <tr key={i} className={`border-b ${TONE_CLASS[tone]}`}>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtTime(start)}–{fmtTime(end)}</td>
                    <td className="py-2 pr-3">
                      <span className="font-semibold">{label}</span>
                      <span className="ml-2 opacity-60 uppercase text-[10px]">{type}</span>
                    </td>
                    <td className="py-2 pr-3">{source}</td>
                    <td className="py-2 pr-3">{status}</td>
                    <td className="py-2 pr-3">{conf}</td>
                    <td className="py-2 pr-3">
                      {action ? formatActionLine(action) : <span className="opacity-50">—</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {warn
                        ? <span className="text-amber-600">{typeof warn === "string" ? warn : warn?.code ?? warn?.message}</span>
                        : <span className="opacity-50">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function WouldWriteList({ data }: { data: any }) {
  const actions: any[] = Array.isArray(data) ? data : data?.actions ?? [];
  const reasons: string[] = data?.reasons ?? data?.skipped ?? [];
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Would write</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {actions.length === 0 && <p className="text-sm text-muted-foreground italic">Inga planerade skrivningar.</p>}
        {actions.map((a, i) => {
          const tone = actionTone(a?.action ?? a?.type ?? "");
          return (
            <div key={i} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-mono ${TONE_CLASS[tone]}`}>
              {actionIcon(a?.action ?? a?.type ?? "")}
              <span>{formatActionLine(a)}</span>
              {a?.reason && <span className="ml-auto opacity-70 text-xs">({a.reason})</span>}
            </div>
          );
        })}
        {reasons.length > 0 && (
          <div className="pt-2 border-t mt-2">
            <p className="text-xs font-semibold mb-1 text-muted-foreground">Skip reasons:</p>
            {reasons.map((r, i) => <div key={i} className="text-xs font-mono text-muted-foreground">• {r}</div>)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const KNOWN_REASONS: Record<string, string> = {
  no_target_match: "Ingen känd plats matchar pings",
  no_recent_pings: "Inga färska pings — telefonen tyst",
  dwell_not_reached: "Personen stannade inte tillräckligt länge",
  active_already_matches: "Aktiv plats är redan rätt — inget att göra",
  workday_locked: "Arbetsdagen är låst/attesterad",
  processor_returned_no_actions: "Processorn returnerade inga åtgärder",
};

function WarningsList({ warnings }: { warnings: any }) {
  const list: any[] = Array.isArray(warnings) ? warnings : warnings ? [warnings] : [];
  if (!list.length) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Warnings</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-emerald-600">Inga varningar.</p></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" /> WHY NOTHING HAPPENED
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.map((w, i) => {
          const code = String(w?.code ?? w?.reason ?? w);
          const human = KNOWN_REASONS[code] ?? w?.message ?? "";
          return (
            <div key={i} className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASS.warn}`}>
              <div className="font-mono text-xs font-semibold">{code}</div>
              {human && <div className="text-xs opacity-90 mt-1">{human}</div>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function PlaceChangeCheck({ result }: { result: any }) {
  const segments: any[] = result?.segmentPreview ?? result?.snapshotPreview?.segments ?? [];
  const stays = segments.filter((s) => {
    const t = s.type ?? s.kind ?? (s.isStationary === false ? "travel" : "stay");
    return !/travel|transport/i.test(t);
  });
  const labels = stays.map((s) => s.label ?? s.matchedSiteName ?? s.matchedPlace?.name ?? "—");
  const changes: Array<{ from: string; to: string; at: string }> = [];
  for (let i = 1; i < stays.length; i++) {
    if (labels[i] !== labels[i - 1]) {
      changes.push({ from: labels[i - 1], to: labels[i], at: stays[i].startTs ?? stays[i].start ?? "" });
    }
  }
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Filter: Platsbyten under dagen</CardTitle>
      </CardHeader>
      <CardContent>
        {changes.length === 0
          ? <p className="text-sm text-muted-foreground">Inga platsbyten upptäcktes (Lager → Josefinas-mönstret).</p>
          : (
            <ul className="space-y-1 text-sm font-mono">
              {changes.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="opacity-70">{fmtTime(c.at)}</span>
                  <span>{c.from}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-semibold">{c.to}</span>
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}

const SOURCE_TONE: Record<string, StatusTone> = {
  workday: "ok",
  time_report: "ok",
  travel_log: "warn",
  location_entry: "ok",
  assistant_event: "neutral",
  flag: "warn",
  ping: "neutral",
  snapshot_segment: "neutral",
};

function EvidenceTimeline({ result }: { result: any }) {
  const list: any[] = result?.evidenceTimeline ?? [];
  if (!list.length) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Evidence timeline</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Inga bevis hittade.</p></CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Evidence timeline ({list.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-muted-foreground border-b">
              <tr className="text-left">
                <th className="py-2 pr-3">Tid</th>
                <th className="py-2 pr-3">Källa</th>
                <th className="py-2 pr-3">Händelse</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => {
                const tone = SOURCE_TONE[e.source] ?? "neutral";
                const time = e.endAt ? `${fmtTime(e.at)}–${fmtTime(e.endAt)}` : fmtTime(e.at);
                return (
                  <tr key={i} className={`border-b ${TONE_CLASS[tone]}`}>
                    <td className="py-2 pr-3 whitespace-nowrap">{time}</td>
                    <td className="py-2 pr-3 uppercase text-[10px] opacity-70">{e.source}</td>
                    <td className="py-2 pr-3">{e.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConflictsList({ result }: { result: any }) {
  const list: any[] = result?.conflicts ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" /> Conflicts ({list.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.length === 0 && <p className="text-sm text-emerald-600">Inga konflikter mellan källor.</p>}
        {list.map((c, i) => (
          <div key={i} className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASS[c.severity === "bad" ? "bad" : "warn"]}`}>
            <div className="font-mono text-xs font-semibold">{c.code}</div>
            <div className="text-xs mt-1">{c.message}</div>
            {c.detail && (
              <pre className="text-[10px] mt-1 opacity-70 whitespace-pre-wrap">{JSON.stringify(c.detail, null, 2)}</pre>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function withinRange(at: string, end: string | null | undefined, t: number): boolean {
  const s = new Date(at).getTime();
  const e = end ? new Date(end).getTime() : s;
  return t >= s && t <= e;
}

function AtTimeProbe({ result }: { result: any }) {
  const [time, setTime] = useState<string>("10:00");
  const raw = result?.rawData ?? {};
  const date: string = result?.debugMeta?.input?.date ?? new Date().toISOString().slice(0, 10);

  const probe = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(time)) return null;
    const target = new Date(`${date}T${time}:00.000Z`).getTime();
    const pings: any[] = raw.pings ?? [];
    const before = [...pings].reverse().find((p) => new Date(p.recorded_at).getTime() <= target) ?? null;
    const after = pings.find((p) => new Date(p.recorded_at).getTime() >= target) ?? null;
    const wd = raw.activeWorkday;
    const activeWorkday = wd && new Date(wd.started_at).getTime() <= target && (!wd.ended_at || new Date(wd.ended_at).getTime() >= target) ? wd : null;
    const activeTr = (raw.timeReports ?? []).find((tr: any) => tr.start_time && tr.end_time && withinRange(tr.start_time, tr.end_time, target)) ?? null;
    const activeTravel = (raw.travelLogs ?? []).find((tl: any) => withinRange(tl.start_time, tl.end_time, target)) ?? null;
    const activeLte = (raw.locationEntries ?? []).find((e: any) => withinRange(e.entered_at, e.exited_at ?? new Date().toISOString(), target)) ?? null;
    const segs: any[] = result?.snapshotPreview?.segments ?? result?.segmentPreview ?? [];
    const activeSegment = segs.find((s: any) => withinRange(s.startTs ?? s.start, s.endTs ?? s.end, target)) ?? null;
    const conflicts: any[] = (result?.conflicts ?? []).filter((c: any) => {
      const d = c.detail;
      if (!d) return false;
      const at = d.start_time ?? d.from ?? d.at;
      const end = d.end_time ?? d.to ?? d.endAt;
      return at && withinRange(at, end, target);
    });
    return { before, after, activeWorkday, activeTr, activeTravel, activeLte, activeSegment, conflicts };
  }, [time, raw, result, date]);

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">At time — var var personen kl…?</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="probe-time">Tid (HH:MM)</Label>
          <Input id="probe-time" value={time} onChange={(e) => setTime(e.target.value)} className="w-32" />
        </div>
        {probe && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
            <StatusPill tone={probe.before ? "ok" : "bad"} label="GPS före" detail={probe.before ? fmtTime(probe.before.recorded_at) : "saknas"} />
            <StatusPill tone={probe.after ? "ok" : "bad"} label="GPS efter" detail={probe.after ? fmtTime(probe.after.recorded_at) : "saknas"} />
            <StatusPill tone={probe.activeWorkday ? "ok" : "warn"} label="Workday" detail={probe.activeWorkday ? "öppen" : "ingen"} />
            <StatusPill tone={probe.activeTr ? "ok" : "neutral"} label="Time report" detail={probe.activeTr ? `${probe.activeTr.booking_id ?? probe.activeTr.large_project_id ?? probe.activeTr.location_id ?? ""}` : "ingen"} />
            <StatusPill tone={probe.activeTravel ? "warn" : "neutral"} label="Travel log" detail={probe.activeTravel ? `${probe.activeTravel.from_address ?? "?"} → ${probe.activeTravel.to_address ?? "?"}` : "ingen"} />
            <StatusPill tone={probe.activeLte ? "ok" : "warn"} label="Location entry" detail={probe.activeLte ? (probe.activeLte.location_id ?? probe.activeLte.booking_id ?? "öppen") : "ingen"} />
            <StatusPill tone={probe.activeSegment ? "ok" : "warn"} label="Snapshot segment" detail={probe.activeSegment ? (probe.activeSegment.label ?? probe.activeSegment.type ?? "—") : "saknas"} />
            <StatusPill tone={probe.conflicts.length ? "bad" : "ok"} label="Konflikter vid tiden" detail={probe.conflicts.length ? `${probe.conflicts.length} st` : "inga"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, data, empty }: { title: string; data: unknown; empty?: string }) {
  const isEmpty =
    data == null ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === "object" && data !== null && !Array.isArray(data) && Object.keys(data as object).length === 0);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {isEmpty ? <p className="text-sm text-muted-foreground">{empty ?? "Inget att visa"}</p> : (
          <ScrollArea className="max-h-96">
            <pre className="text-xs whitespace-pre-wrap break-words font-mono">
              {JSON.stringify(data, null, 2)}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

const PING_KLASS_TONE: Record<string, StatusTone> = {
  project: "ok",
  booking: "ok",
  warehouse: "ok",
  travel: "warn",
  other_place: "neutral",
  unknown: "neutral",
  bad_accuracy: "bad",
  gps_gap_marker: "warn",
};

const PING_KLASS_LABEL: Record<string, string> = {
  project: "Projekt",
  booking: "Bokning",
  warehouse: "Lager",
  travel: "Förflyttning",
  other_place: "Annan plats",
  unknown: "Okänt",
  bad_accuracy: "Osäker GPS",
  gps_gap_marker: "GPS-gap",
};

function PingFirstPanel({ data }: { data: any }) {
  if (!data) return null;
  if (!data.ok) {
    return (
      <Card className="border-destructive">
        <CardHeader className="pb-3"><CardTitle className="text-base">Ping-first pipeline</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-destructive font-mono">{data.error ?? "Okänt fel"}</p></CardContent>
      </Card>
    );
  }
  const segs: any[] = data.segments ?? [];
  const summary: Record<string, { count: number; minutes: number }> = data.summary ?? {};
  const ctx = data.context ?? {};
  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Ping-first pipeline ({data.rawPingCount} pings → {segs.length} segment)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.rawPingCoverage && (
          <div className={`text-xs rounded-md border px-3 py-2 ${data.rawPingCoverage.truncated ? TONE_CLASS.bad : TONE_CLASS.ok}`}>
            <div className="font-mono">
              Coverage: {data.rawPingCoverage.totalFetched} pings · {data.rawPingCoverage.pageCount} sidor
              {data.rawPingCoverage.truncated ? " · TRUNCATED!" : ""}
            </div>
            <div className="opacity-80">
              Första: {fmtTime(data.rawPingCoverage.firstPingAt)} · Sista: {fmtTime(data.rawPingCoverage.lastPingAt)}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(summary).map(([k, v]) => (
            <Badge key={k} variant="outline" className={TONE_CLASS[PING_KLASS_TONE[k] ?? "neutral"]}>
              {PING_KLASS_LABEL[k] ?? k}: {v.count} st · {v.minutes} min
            </Badge>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Workday aktiv: {ctx.workdayActive ? "ja" : "nej"} · Öppna LTE: {ctx.openLteCount ?? 0} ·
          Time reports: {ctx.timeReportsCount ?? 0} · Travel logs: {ctx.travelLogsCount ?? 0} ·
          Geofence-kandidater: {data.candidateCount}
        </div>
        {Array.isArray(data.rawClusters) && data.rawClusters.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-1 text-muted-foreground">
              Råa ping-kluster (före tolkning) — {data.rawClusters.length} st
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-1 pr-3">#</th>
                    <th className="py-1 pr-3">Tid</th>
                    <th className="py-1 pr-3">Min</th>
                    <th className="py-1 pr-3">Pings</th>
                    <th className="py-1 pr-3">Centroid</th>
                    <th className="py-1 pr-3">Acc.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rawClusters.map((c: any) => (
                    <tr key={c.index} className="border-b">
                      <td className="py-1 pr-3 opacity-60">{c.index}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">{fmtTime(c.start_at)}–{fmtTime(c.end_at)}</td>
                      <td className="py-1 pr-3">{c.duration_min}</td>
                      <td className="py-1 pr-3">{c.ping_count}</td>
                      <td className="py-1 pr-3 opacity-80">{c.centroid_lat.toFixed(4)}, {c.centroid_lng.toFixed(4)}</td>
                      <td className="py-1 pr-3 opacity-80">{c.avg_accuracy ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="text-muted-foreground border-b">
              <tr className="text-left">
                <th className="py-2 pr-3">Tid</th>
                <th className="py-2 pr-3">Klass</th>
                <th className="py-2 pr-3">Plats</th>
                <th className="py-2 pr-3">Min</th>
                <th className="py-2 pr-3">Pings</th>
                <th className="py-2 pr-3">Conf.</th>
                <th className="py-2 pr-3">Kontext</th>
              </tr>
            </thead>
            <tbody>
              {segs.map((s, i) => {
                const tone = PING_KLASS_TONE[s.klass] ?? "neutral";
                const ctxBits: string[] = [];
                if (s.context?.overlapping_time_report_id) ctxBits.push("TR");
                if (s.context?.overlapping_lte_id) ctxBits.push("LTE");
                if (s.context?.overlapping_travel_log_id) ctxBits.push("TRAVEL");
                if (s.context?.workday_active_during) ctxBits.push("WD");
                return (
                  <tr key={i} className={`border-b ${TONE_CLASS[tone]}`}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtTime(s.start_at)}–{fmtTime(s.end_at)}
                    </td>
                    <td className="py-2 pr-3 uppercase text-[10px]">{PING_KLASS_LABEL[s.klass] ?? s.klass}</td>
                    <td className="py-2 pr-3 font-semibold">{s.label}</td>
                    <td className="py-2 pr-3">{s.duration_min}</td>
                    <td className="py-2 pr-3">{s.ping_count}</td>
                    <td className="py-2 pr-3">{Math.round((s.confidence ?? 0) * 100)}%</td>
                    <td className="py-2 pr-3 opacity-80">{ctxBits.join(" · ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Full JSON (ping-first)</summary>
          <ScrollArea className="max-h-96 mt-2">
            <pre className="text-[10px] whitespace-pre-wrap break-words font-mono bg-muted p-2 rounded">
              {JSON.stringify(data, null, 2)}
            </pre>
          </ScrollArea>
        </details>
      </CardContent>
    </Card>
  );
}

function ThreeLayerPanel({ result }: { result: any }) {
  const raw = result?.rawPingsCoverage ?? null;
  const gps = result?.gpsDayTimeline ?? null;
  const pay = result?.payableSnapshot ?? null;
  const cc = result?.compactCounts ?? {};
  const warnings: string[] = Array.isArray(result?.warnings) ? result.warnings : [];
  const clipped = warnings.includes("gps_day_timeline_is_clipped_to_workday");

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">GPS-tidslinje vs Arbetstidssnapshot (3 lager)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {clipped && (
          <div className={`rounded-md border px-3 py-2 text-xs font-mono ${TONE_CLASS.bad}`}>
            ⚠ gps_day_timeline_is_clipped_to_workday — pings finns utanför workday-fönstret men GPS-timelinen täcker bara workday.
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <StatusPill tone={cc.rawPingCount > 0 ? "ok" : "bad"} label="rawPingCount" detail={String(cc.rawPingCount ?? "—")} />
          <StatusPill tone={cc.gpsDayTimelineCount > 0 ? "ok" : "warn"} label="gpsDayTimelineCount" detail={String(cc.gpsDayTimelineCount ?? "—")} />
          <StatusPill tone={cc.snapshotSegmentsCount > 0 ? "ok" : "warn"} label="snapshotSegmentsCount" detail={String(cc.snapshotSegmentsCount ?? "—")} />
          <StatusPill tone={cc.workdayStart ? "ok" : "warn"} label="workdayStart" detail={fmtTime(cc.workdayStart)} />
          <StatusPill tone={cc.workdayEnd ? "ok" : "warn"} label="workdayEnd" detail={fmtTime(cc.workdayEnd)} />
          <StatusPill tone={cc.workdayDurationMinutes != null ? "ok" : "neutral"} label="workdayDurationMin" detail={cc.workdayDurationMinutes != null ? `${cc.workdayDurationMinutes} min` : "—"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-xs font-semibold uppercase opacity-70">1. rawPingsCoverage</div>
            <div className="text-xs font-mono">Pings: {raw?.pingCount ?? 0}</div>
            <div className="text-xs font-mono">Första: {fmtTime(raw?.firstPingAt)}</div>
            <div className="text-xs font-mono">Sista: {fmtTime(raw?.lastPingAt)}</div>
            <div className="text-xs font-mono opacity-70">Gaps &gt;10min: {raw?.pingGapsOver10MinCount ?? 0}</div>
          </div>
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-xs font-semibold uppercase opacity-70">2. gpsDayTimeline (all_pings)</div>
            <div className="text-xs font-mono">Segments: {gps?.count ?? gps?.totalSegments ?? 0}</div>
            <div className="text-xs font-mono">Första start: {fmtTime(gps?.firstStart)}</div>
            <div className="text-xs font-mono">Sista slut: {fmtTime(gps?.lastEnd)}</div>
            <div className="text-xs font-mono opacity-70">Source: {gps?.source ?? "—"}</div>
          </div>
          <div className={`rounded-md border p-3 space-y-1 ${clipped ? TONE_CLASS.warn : ""}`}>
            <div className="text-xs font-semibold uppercase opacity-70">3. payableSnapshot (workday)</div>
            <div className="text-xs font-mono">Workday: {fmtTime(pay?.workdayStart)}–{fmtTime(pay?.workdayEnd)}</div>
            <div className="text-xs font-mono">Längd: {pay?.workdayDurationMinutes != null ? `${pay.workdayDurationMinutes} min` : "—"}</div>
            <div className="text-xs font-mono">Segments: {pay?.segmentsCount ?? 0}</div>
            <div className="text-xs font-mono opacity-70">
              {pay?.workdayApproved ? "approved" : pay?.workdayIsOpen ? "open" : pay?.workdayStart ? "closed" : "no workday"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface StaffOption { id: string; name: string; }

interface BatchRow {
  staffId: string;
  name: string;
  ok: boolean;
  pingCount: number;
  segments: number;
  wouldWrite: number;
  warnings: number;
  detected: string | null;
  error?: string;
}

export default function TimeIntelligenceDebug() {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  const [date, setDate] = useState<string>(todayIso);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [batch, setBatch] = useState<BatchRow[] | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [pingFirst, setPingFirst] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff_members").select("id, name").eq("is_active", true).order("name");
      setStaff(data ?? []);
    })();
  }, []);

  const runDryRun = async (overrideStaffId?: string, overrideDate?: string) => {
    const sId = overrideStaffId ?? staffId;
    const d = overrideDate ?? date;
    if (!sId || !d) return null;
    setLoading(true); setError(null); setResult(null); setBatch(null); setPingFirst(null);
    try {
      const [debugRes, pingRes] = await Promise.all([
        supabase.functions.invoke("debug-time-intelligence", {
          body: { staffId: sId, date: d, dryRun },
        }),
        supabase.functions.invoke("ping-day-pipeline", {
          body: { staffId: sId, date: d },
        }),
      ]);
      if (debugRes.error) throw debugRes.error;
      setResult(debugRes.data);
      if (pingRes.error) {
        setPingFirst({ ok: false, error: pingRes.error?.message ?? String(pingRes.error) });
      } else {
        setPingFirst(pingRes.data);
      }
      return debugRes.data;
    } catch (e: any) {
      setError(e?.message ?? String(e));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const runBatch = async (targetDate: string, onlyActiveWorkday: boolean) => {
    setLoading(true); setError(null); setResult(null); setBatch(null);
    try {
      let staffList = staff;
      if (onlyActiveWorkday) {
        const { data: wd } = await supabase
          .from("workdays")
          .select("staff_id")
          .gte("started_at", `${targetDate}T00:00:00Z`)
          .lt("started_at", `${targetDate}T23:59:59Z`);
        const ids = new Set((wd ?? []).map((w: any) => w.staff_id));
        staffList = staff.filter((s) => ids.has(s.id));
      }
      const rows: BatchRow[] = [];
      setBatchProgress({ done: 0, total: staffList.length });
      for (const s of staffList) {
        try {
          const { data, error } = await supabase.functions.invoke("debug-time-intelligence", {
            body: { staffId: s.id, date: targetDate, dryRun: true },
          });
          if (error) throw error;
          const segs = data?.segmentPreview ?? data?.snapshotPreview?.segments ?? [];
          const ww = Array.isArray(data?.wouldWrite) ? data.wouldWrite : (data?.wouldWrite?.actions ?? []);
          rows.push({
            staffId: s.id, name: s.name, ok: true,
            pingCount: data?.rawData?.pingCount ?? 0,
            segments: segs.length,
            wouldWrite: ww.length,
            warnings: (data?.warnings ?? []).length,
            detected: data?.detectedState?.targetKey ?? data?.detectedState?.target?.key ?? null,
          });
        } catch (e: any) {
          rows.push({
            staffId: s.id, name: s.name, ok: false,
            pingCount: 0, segments: 0, wouldWrite: 0, warnings: 0, detected: null,
            error: e?.message ?? String(e),
          });
        }
        setBatchProgress({ done: rows.length, total: staffList.length });
      }
      setBatch(rows);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  };

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true); toast.success("Debug JSON kopierad");
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      toast.error("Kunde inte kopiera: " + (e?.message ?? String(e)));
    }
  };

  const buildCompactSummary = () => {
    const r = result ?? {};
    const raw = r.rawData ?? {};
    const tm = r.targetMatches ?? {};
    const snap = r.snapshotPreview ?? {};
    const ww = r.wouldWrite ?? {};
    const dm = r.debugMeta ?? {};
    const cap = (arr: any) => Array.isArray(arr) ? arr.slice(0, 20) : arr;
    return {
      rawData: {
        pingCount: raw.pingCount,
        firstPingAt: raw.firstPingAt,
        lastPingAt: raw.lastPingAt,
        pingGapsOver10Min: raw.pingGapsOver10Min,
        knownTargets: raw.knownTargets,
        nearestTargetsPerPingCount: Array.isArray(raw.nearestTargetsPerPing) ? raw.nearestTargetsPerPing.length : raw.nearestTargetsPerPingCount,
        pingClassificationTimelineCount: Array.isArray(raw.pingClassificationTimeline) ? raw.pingClassificationTimeline.length : raw.pingClassificationTimelineCount,
      },
      targetMatches: {
        summary: tm.summary,
      },
      segmentPreview: cap(r.segmentPreview ?? snap.segments),
      snapshotPreview: {
        totals: snap.totals,
        segmentSource: snap.segmentSource,
        segments: cap(snap.segments),
        rawEvidenceCounts: {
          timeReports: Array.isArray(snap.rawEvidence?.timeReports) ? snap.rawEvidence.timeReports.length : snap.rawEvidenceCounts?.timeReports,
          travelLogs: Array.isArray(snap.rawEvidence?.travelLogs) ? snap.rawEvidence.travelLogs.length : snap.rawEvidenceCounts?.travelLogs,
          locationEntries: Array.isArray(snap.rawEvidence?.locationEntries) ? snap.rawEvidence.locationEntries.length : snap.rawEvidenceCounts?.locationEntries,
        },
        debugMeta: snap.debugMeta,
      },
      wouldWrite: {
        engineReport: {
          report: {
            pings: ww.engineReport?.report?.pings,
            arrivals: ww.engineReport?.report?.arrivals,
            switches: ww.engineReport?.report?.switches,
            workdays_opened: ww.engineReport?.report?.workdays_opened,
            ltes_opened: ww.engineReport?.report?.ltes_opened,
            ltes_closed: ww.engineReport?.report?.ltes_closed,
            travels_created: ww.engineReport?.report?.travels_created,
            plan: ww.engineReport?.report?.plan,
          },
        },
        plannedActions: cap(ww.plannedActions),
        inactionReasons: cap(ww.inactionReasons),
      },
      warnings: cap(r.warnings),
      conflicts: cap(r.conflicts),
      rawPingsCoverage: r.rawPingsCoverage,
      gpsDayTimeline: r.gpsDayTimeline ? {
        count: r.gpsDayTimeline.count,
        firstStart: r.gpsDayTimeline.firstStart,
        lastEnd: r.gpsDayTimeline.lastEnd,
        source: r.gpsDayTimeline.source,
        segments: cap(r.gpsDayTimeline.segments),
      } : null,
      payableSnapshot: r.payableSnapshot ? {
        workdayStart: r.payableSnapshot.workdayStart,
        workdayEnd: r.payableSnapshot.workdayEnd,
        workdayDurationMinutes: r.payableSnapshot.workdayDurationMinutes,
        workdayIsOpen: r.payableSnapshot.workdayIsOpen,
        workdayApproved: r.payableSnapshot.workdayApproved,
        totals: r.payableSnapshot.totals,
        segmentSource: r.payableSnapshot.segmentSource,
        segmentsCount: Array.isArray(r.payableSnapshot.segments) ? r.payableSnapshot.segments.length : null,
      } : null,
      compactCounts: dm.compactCounts ?? {
        rawPingCount: raw.pingCount,
        gpsDayTimelineCount: r.gpsDayTimeline?.count ?? null,
        snapshotSegmentsCount: Array.isArray(snap.segments) ? snap.segments.length : null,
        workdayStart: snap.workday?.startedAt ?? null,
        workdayEnd: snap.workday?.endedAt ?? null,
        workdayDurationMinutes: snap.workday?.durationMinutes ?? null,
      },
      debugMeta: {
        diagnostics: dm.diagnostics,
        rawPingCoverage: dm.rawPingCoverage,
        warnings: dm.warnings,
      },
    };
  };

  const copyCompactSummary = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildCompactSummary(), null, 2));
      toast.success("Compact debug summary kopierad");
    } catch (e: any) {
      toast.error("Kunde inte kopiera: " + (e?.message ?? String(e)));
    }
  };

  const copyTimeEngineSummary = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildTimeEngineSummary(result), null, 2));
      toast.success("Time Engine dry-run summary kopierad");
    } catch (e: any) {
      toast.error("Kunde inte kopiera: " + (e?.message ?? String(e)));
    }
  };

  const isDryRun = result?.dryRun !== false;
  const datePreset = useMemo(() =>
    date === todayIso() ? "today" : date === yesterdayIso() ? "yesterday" : "custom",
  [date]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Time Intelligence – Torrkörning</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Intern debugvy. Torrkör hela personens dag utan att skriva data.
          </p>
        </div>
        <Badge variant="destructive" className="shrink-0">
          <AlertTriangle className="h-3 w-3 mr-1" /> Endast admin/dev
        </Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Inställningar</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Personal</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Välj personal" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <div className="flex items-center gap-2">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="flex gap-1 pt-1">
                <Button size="sm" variant={datePreset === "today" ? "default" : "outline"} onClick={() => setDate(todayIso())}>Idag</Button>
                <Button size="sm" variant={datePreset === "yesterday" ? "default" : "outline"} onClick={() => setDate(yesterdayIso())}>Igår</Button>
                {datePreset === "custom" && <Badge variant="outline" className="self-center">Valt datum</Badge>}
              </div>
            </div>
            <div className="space-y-2 flex flex-col justify-end">
              <Button onClick={() => runDryRun()} disabled={!staffId || !date || loading} size="lg">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Torrkör hela dagen
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <Switch id="dryrun" checked={dryRun} onCheckedChange={setDryRun} />
              <Label htmlFor="dryrun" className="cursor-pointer">
                dryRun {dryRun ? "= true (säkert)" : "= false (LIVE!)"}
              </Label>
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => runBatch(todayIso(), true)} disabled={loading}>
                Kör alla med aktiv arbetsdag idag
              </Button>
              <Button variant="outline" size="sm" onClick={() => runBatch(yesterdayIso(), false)} disabled={loading}>
                Kör alla igår
              </Button>
            </div>
          </div>
          {batchProgress && (
            <p className="text-xs text-muted-foreground">
              Kör batch: {batchProgress.done} / {batchProgress.total}
            </p>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6"><p className="text-sm text-destructive font-mono">{error}</p></CardContent>
        </Card>
      )}

      {batch && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Batch-resultat ({batch.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Personal</th>
                    <th className="py-2 pr-3">Pings</th>
                    <th className="py-2 pr-3">Segment</th>
                    <th className="py-2 pr-3">Would write</th>
                    <th className="py-2 pr-3">Warnings</th>
                    <th className="py-2 pr-3">Detected</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {batch.map((r) => (
                    <tr key={r.staffId} className="border-b">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3">{r.pingCount}</td>
                      <td className="py-2 pr-3">{r.segments}</td>
                      <td className="py-2 pr-3">{r.wouldWrite}</td>
                      <td className={`py-2 pr-3 ${r.warnings > 0 ? "text-amber-600" : ""}`}>{r.warnings}</td>
                      <td className="py-2 pr-3 font-mono">{r.detected ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Button size="sm" variant="ghost" onClick={() => { setStaffId(r.staffId); runDryRun(r.staffId); }}>
                          Öppna
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isDryRun ? "secondary" : "destructive"}>
              {isDryRun ? "DRY-RUN — inga skrivningar" : "LIVE — data har ändrats"}
            </Badge>
            <Button variant="default" size="sm" onClick={copyTimeEngineSummary} className="ml-auto">
              <Copy className="h-4 w-4 mr-2" />
              Copy compact Time Engine dry-run summary
            </Button>
            <Button variant="outline" size="sm" onClick={copyCompactSummary}>
              <Copy className="h-4 w-4 mr-2" />
              Copy compact debug summary
            </Button>
            <Button variant="outline" size="sm" onClick={copyJson}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Kopiera debug JSON
            </Button>
          </div>

          <TimeEngineDryRunSummary result={result} />

          <PingFirstPanel data={pingFirst} />
          <ThreeLayerPanel result={result} />
          <StatusGrid result={result} />
          <DayTimeline result={result} />
          <EvidenceTimeline result={result} />
          <ConflictsList result={result} />
          <AtTimeProbe result={result} />
          <PlaceChangeCheck result={result} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Raw data" data={result.rawData} />
            <Section title="Target matches" data={result.targetMatches} />
            <Section title="Detected state" data={result.detectedState} />
            <Section title="Segment preview" data={result.segmentPreview ?? result.segments} />
            <WouldWriteList data={result.wouldWrite} />
            <WarningsList warnings={result.warnings} />
            <Section title="Snapshot preview" data={result.snapshotPreview} />
            <Section title="Debug meta" data={result.debugMeta ?? result.diagnostics} />
          </div>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Full JSON</CardTitle>
              <Button variant="outline" size="sm" onClick={copyJson}>
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Kopiera
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[500px]">
                <pre className="text-xs whitespace-pre-wrap break-words font-mono bg-muted p-3 rounded">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
