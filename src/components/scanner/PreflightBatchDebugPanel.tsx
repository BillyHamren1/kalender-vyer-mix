import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDaysIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

interface BookingRow {
  worstStatus?: string;
  blocked?: number;
  warning?: number;
  [k: string]: unknown;
}

export default function PreflightBatchDebugPanel() {
  const [fromDate, setFromDate] = useState<string>(todayIso());
  const [toDate, setToDate] = useState<string>(plusDaysIso(60));
  const [status, setStatus] = useState<string>("confirmed");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  const handleRun = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const { data: resp, error: err } = await supabase.functions.invoke(
        "packing-preflight-batch",
        { body: { from_date: fromDate, to_date: toDate, status } },
      );
      if (err) {
        setError(err);
        // eslint-disable-next-line no-console
        console.log("[preflight-batch-error]", err);
      } else {
        setData(resp);
        // eslint-disable-next-line no-console
        console.log("[preflight-batch-result]", resp);
      }
    } catch (e: any) {
      setError(e);
      // eslint-disable-next-line no-console
      console.log("[preflight-batch-exception]", e);
    } finally {
      setLoading(false);
    }
  };

  const summary = (() => {
    if (!data) return null;
    const bookings: BookingRow[] = Array.isArray(data?.bookings)
      ? data.bookings
      : Array.isArray(data?.results)
        ? data.results
        : [];
    let blocked = 0;
    let warning = 0;
    let pass = 0;
    for (const b of bookings) {
      const blk = Number(b.blocked ?? 0);
      const wrn = Number(b.warning ?? 0);
      if (b.worstStatus === "BLOCKED" || blk > 0) blocked++;
      else if (wrn > 0) warning++;
      else pass++;
    }
    return {
      totalBookingsChecked:
        data?.totalBookingsChecked ?? data?.total ?? bookings.length,
      blocked,
      warning,
      pass,
    };
  })();

  return (
    <Card className="mt-8 border-dashed">
      <CardHeader>
        <CardTitle>Preflight batch-kontroll</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="pf-from">from_date</Label>
            <Input
              id="pf-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pf-to">to_date</Label>
            <Input
              id="pf-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pf-status">status</Label>
            <Input
              id="pf-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleRun} disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kör preflight på kommande bokningar
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="font-semibold text-destructive">
              {error?.message ?? "Okänt fel"}
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-xs">
              {JSON.stringify(error, Object.getOwnPropertyNames(error ?? {}), 2)}
            </pre>
          </div>
        )}

        {summary && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>Total: <strong>{summary.totalBookingsChecked}</strong></div>
            <div>BLOCKED: <strong>{summary.blocked}</strong></div>
            <div>WARNING: <strong>{summary.warning}</strong></div>
            <div>PASS: <strong>{summary.pass}</strong></div>
          </div>
        )}

        {data && (
          <pre className="max-h-[480px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
