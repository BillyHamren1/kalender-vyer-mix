import { useState } from "react";
import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMarkPayrollPeriodApproved } from "@/hooks/staff/useMarkPayrollPeriodApproved";

interface Props {
  periodId: string;
  isLocked: boolean;
  approvedAt?: string | null;
}

export function PayrollPeriodApprovalPanel({ periodId, isLocked, approvedAt }: Props) {
  const mark = useMarkPayrollPeriodApproved();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [warning, setWarning] = useState<{
    needsControlCount: number;
    includedCount: number;
    message: string;
  } | null>(null);

  const run = async (confirm: boolean) => {
    try {
      const res = await mark.mutateAsync({ payroll_period_id: periodId, confirm });
      if (res.warning === "needs_control_present") {
        setWarning({
          needsControlCount: res.needsControlCount ?? 0,
          includedCount: res.includedCount ?? 0,
          message: res.message ?? "Kontrollmarkerade dagar finns.",
        });
        setConfirmOpen(true);
        return;
      }
      if (res.ok) {
        toast.success("Perioden är godkänd för utbetalning");
        setConfirmOpen(false);
        setWarning(null);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte markera perioden");
      setConfirmOpen(false);
    }
  };

  if (isLocked) {
    return (
      <Card className="p-4 border-violet-500/40 bg-violet-500/5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-violet-600" />
          <div>
            <div className="font-semibold flex items-center gap-2">
              Godkänd för utbetalning
              <Badge variant="outline" className="bg-violet-500/15 text-violet-600 border-violet-500/30">
                Låst
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {approvedAt
                ? `Godkänd ${new Date(approvedAt).toLocaleString("sv-SE")}`
                : "Perioden är låst för ändringar."}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Endast särskild adminåtgärd kan ändra dagar i låst period.
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold">Markera perioden som godkänd för utbetalning</div>
            <div className="text-sm text-muted-foreground">
              Lås perioden när alla dagar är granskade. Detta är sista steget innan löneunderlaget skickas vidare.
            </div>
          </div>
        </div>
        <Button onClick={() => run(false)} disabled={mark.isPending} className="gap-2">
          {mark.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Godkänd för utbetalning
        </Button>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kontrollmarkerade dagar finns</AlertDialogTitle>
            <AlertDialogDescription>
              {warning?.message}{" "}
              Vill du låsa perioden ändå? {warning?.includedCount ?? 0} dagar är godkända och ingår i utbetalningen.
              Kontrollmarkerade dagar ingår INTE.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(true)}>Lås ändå</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
