import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, AlertTriangle, Copy, Check, CheckCircle2, XCircle, AlertCircle, ArrowRight, Plus, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type StatusTone = "ok" | "warn" | "bad" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  bad: "bg-destructive/15 text-destructive border-destructive/30",
  neutral: "bg-muted text-muted-foreground border-border",
};

function StatusPill({ tone, label, detail }: { tone: StatusTone; label: string; detail?: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : tone === "warn" ? AlertCircle : AlertCircle;
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

function StatusGrid({ result }: { result: any }) {
  const raw = result?.rawData ?? {};
  const tm = result?.targetMatches ?? {};
  const ww = Array.isArray(result?.wouldWrite) ? result.wouldWrite : (result?.wouldWrite?.actions ?? []);
  const snap = result?.snapshotPreview ?? {};

  const pingCount = raw?.pings?.count ?? raw?.pings?.length ?? 0;
  const lastPing = raw?.pings?.last ?? raw?.staffLocation?.recorded_at ?? null;
  const lastAge = ageMinutes(lastPing);

  const openLte = (raw?.locationEntries ?? []).find?.((e: any) => !e.ended_at) ?? raw?.openLocationTimeEntry ?? null;

  const targetHit = ["warehouse", "booking", "large_project", "project_location"].some(
    (k) => tm?.[k]?.firstMatchAt || tm?.[k]?.lastMatchAt
  );

  const hasClose = ww.some?.((a: any) => /close/i.test(a?.action ?? a?.type ?? ""));
  const hasTransport = ww.some?.((a: any) => /transport|travel/i.test(a?.action ?? a?.type ?? ""));
  const hasOpen = ww.some?.((a: any) => /^open|start_lte|create_lte/i.test(a?.action ?? a?.type ?? ""));

  const detectedTarget = result?.detectedState?.targetKey ?? result?.detectedState?.target?.key ?? null;
  const snapActive = snap?.activeKey ?? snap?.active?.key ?? snap?.activeLabel ?? null;
  const snapMatches = detectedTarget && snapActive ? String(snapActive).includes(String(detectedTarget)) : null;

  const items: Array<{ tone: StatusTone; label: string; detail?: string }> = [
    pingCount > 0
      ? { tone: "ok", label: `Pings finns (${pingCount})`, detail: `Senaste: ${fmtTime(lastPing)}` }
      : { tone: "bad", label: "Inga pings", detail: "Telefonen har inte rapporterat in" },
    lastAge == null
      ? { tone: "neutral", label: "Ping-ålder okänd" }
      : lastAge <= 10
      ? { tone: "ok", label: "Ping färsk", detail: `${lastAge} min sedan` }
      : lastAge <= 30
      ? { tone: "warn", label: "Ping börjar bli gammal", detail: `${lastAge} min sedan` }
      : { tone: "bad", label: "Ping för gammal (signal-stale)", detail: `${lastAge} min sedan` },
    targetHit
      ? { tone: "ok", label: "Target match hittad", detail: detectedTarget ?? "" }
      : { tone: "bad", label: "Ingen target match", detail: "Ingen känd plats matchar pings" },
    openLte
      ? { tone: "ok", label: "Aktiv location_time_entry", detail: openLte?.label ?? openLte?.target_label ?? openLte?.location_id ?? "öppen" }
      : { tone: "warn", label: "Ingen aktiv LTE", detail: "Ingen öppen tid pågår" },
    hasClose
      ? { tone: "ok", label: "Skulle stänga gammal plats" }
      : { tone: "neutral", label: "Skulle inte stänga någon plats" },
    hasTransport
      ? { tone: "ok", label: "Skulle skapa transport" }
      : { tone: "neutral", label: "Skulle inte skapa transport" },
    hasOpen
      ? { tone: "ok", label: "Skulle öppna ny plats" }
      : { tone: "neutral", label: "Skulle inte öppna någon ny plats" },
    snapMatches == null
      ? { tone: "neutral", label: "Snapshot active: okänt" }
      : snapMatches
      ? { tone: "ok", label: "Snapshot visar rätt active", detail: String(snapActive) }
      : { tone: "bad", label: "Snapshot visar FEL active", detail: `active=${snapActive} ≠ detected=${detectedTarget}` },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {items.map((it, i) => (
            <StatusPill key={i} {...it} />
          ))}
        </div>
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
  if (/snapshot|rebuild/i.test(action)) return "neutral";
  if (/stale|wake/i.test(action)) return "warn";
  return "neutral";
}

function formatActionLine(a: any): string {
  const act = String(a?.action ?? a?.type ?? "ACTION").toUpperCase();
  const label = a?.label ?? a?.target ?? a?.targetKey ?? "";
  const t1 = a?.at ?? a?.start ?? a?.startedAt;
  const t2 = a?.end ?? a?.endedAt;
  if (/transport|travel/i.test(act)) {
    return `CREATE TRANSPORT: ${fmtTime(t1)}–${fmtTime(t2)}`;
  }
  if (/close/i.test(act)) {
    return `CLOSE: ${label || "—"}${t1 ? ` at ${fmtTime(t1)}` : ""}`;
  }
  if (/open|start_lte|create_lte/i.test(act)) {
    return `OPEN: ${label || "—"}${t1 ? ` at ${fmtTime(t1)}` : ""}`;
  }
  if (/snapshot|rebuild/i.test(act)) return "REBUILD SNAPSHOT";
  if (/stale/i.test(act)) return "MARK SIGNAL_STALE";
  if (/wake/i.test(act)) return "REQUEST WAKE PING";
  return `${act}${label ? `: ${label}` : ""}${t1 ? ` at ${fmtTime(t1)}` : ""}`;
}

function WouldWriteList({ data }: { data: any }) {
  const actions: any[] = Array.isArray(data) ? data : data?.actions ?? [];
  const reasons: string[] = data?.reasons ?? data?.skipped ?? [];
  if (!actions.length && !reasons.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Would write</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Motorn planerar inga skrivningar.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Would write</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Inga planerade skrivningar.</p>
        )}
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
            {reasons.map((r, i) => (
              <div key={i} className="text-xs font-mono text-muted-foreground">• {r}</div>
            ))}
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
  current_active_already_same_as_detected_target: "Aktiv plats är redan rätt — inget att göra",
  workday_locked: "Arbetsdagen är låst/attesterad",
  processor_not_triggered: "Processorn kördes aldrig (ingen trigger)",
  processor_returned_no_actions: "Processorn returnerade inga åtgärder",
};

function WarningsList({ warnings }: { warnings: any }) {
  const list: any[] = Array.isArray(warnings) ? warnings : warnings ? [warnings] : [];
  if (!list.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-emerald-600">Inga varningar — motorn är nöjd.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          WHY NOTHING HAPPENED
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

interface StaffOption {
  id: string;
  name: string;
}

function Section({ title, data, empty }: { title: string; data: unknown; empty?: string }) {
  const isEmpty =
    data == null ||
    (Array.isArray(data) && data.length === 0) ||
    (typeof data === "object" && data !== null && !Array.isArray(data) && Object.keys(data as object).length === 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">{empty ?? "Inget att visa"}</p>
        ) : (
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

export default function TimeIntelligenceDebug() {
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      setStaff(data ?? []);
    })();
  }, []);

  const runDryRun = async () => {
    if (!staffId || !date) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("debug-time-intelligence", {
        body: { staffId, date, dryRun },
      });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const runScenarios = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("debug-time-intelligence", {
        body: { mode: "scenarios" },
      });
      if (error) throw error;
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const copyJson = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      toast.success("Debug JSON kopierad");
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      toast.error("Kunde inte kopiera: " + (e?.message ?? String(e)));
    }
  };

  const isDryRun = result?.dryRun !== false;

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Time Intelligence – Torrkörning</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Intern debugvy. Kör backend i dry-run-läge utan att ändra data.
          </p>
        </div>
        <Badge variant="destructive" className="shrink-0">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Endast admin/dev
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inställningar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Personal</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj personal" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Datum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2 flex flex-col justify-end">
              <Button onClick={runDryRun} disabled={!staffId || !date || loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Torrkör Time Intelligence
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Switch id="dryrun" checked={dryRun} onCheckedChange={setDryRun} />
              <Label htmlFor="dryrun" className="cursor-pointer">
                dryRun {dryRun ? "= true (säkert)" : "= false (LIVE skrivning!)"}
              </Label>
            </div>
            <Button variant="outline" size="sm" onClick={runScenarios} disabled={loading}>
              Kör 5 standardscenarion
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive font-mono">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={isDryRun ? "secondary" : "destructive"}>
              {isDryRun ? "DRY-RUN — inga skrivningar utförda" : "LIVE — data har ändrats"}
            </Badge>
            {result.summary && (
              <Badge variant="outline">
                Scenarios: {result.summary.passed}/{result.summary.total}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={copyJson} className="ml-auto">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Kopiera debug JSON
            </Button>
          </div>

          {result.scenarios ? (
            <Section title="Scenarioresultat" data={result.scenarios} />
          ) : (
            <>
              <StatusGrid result={result} />
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
        </>
      )}
    </div>
  );
}
