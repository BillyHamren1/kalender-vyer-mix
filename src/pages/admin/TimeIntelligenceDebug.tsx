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
import { Loader2, Play, AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";

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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Raw data" data={result.rawData} />
                <Section title="Target matches" data={result.targetMatches} />
                <Section title="Detected state" data={result.detectedState} />
                <Section title="Segment preview" data={result.segmentPreview ?? result.segments} />
                <Section title="Would write" data={result.wouldWrite} />
                <Section title="Warnings" data={result.warnings} empty="Inga varningar" />
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
