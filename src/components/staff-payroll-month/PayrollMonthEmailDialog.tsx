import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Info, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatMinutes, type PayrollMonthReportData } from "@/hooks/staff/usePayrollMonthReport";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface Props {
  open: boolean;
  onClose: () => void;
  report: PayrollMonthReportData | null | undefined;
}

function buildDefaults(report: PayrollMonthReportData) {
  const label = (() => {
    try {
      return format(new Date(`${report.month}-01T00:00:00`), "LLLL yyyy", { locale: sv });
    } catch {
      return report.month;
    }
  })();
  const subject = `Löneunderlag ${label}`;
  const body =
    `Hej,\n\n` +
    `Här kommer löneunderlag för ${label}.\n\n` +
    `Sammanfattning:\n` +
    `- Personal: ${report.totals.staffCount}\n` +
    `- Godkända dagar: ${report.totals.approvedDaysCount}\n` +
    `- Total arbetstid: ${formatMinutes(report.totals.totalMinutes)}\n` +
    `- Total rast: ${formatMinutes(report.totals.totalBreakMinutes)}\n\n` +
    `PDF kan exporteras från EventFlow och bifogas vid behov.\n\n` +
    `Vänligen,\n` +
    `EventFlow`;
  return { subject, body };
}

const PayrollMonthEmailDialog: React.FC<Props> = ({ open, onClose, report }) => {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open && report) {
      const d = buildDefaults(report);
      setSubject(d.subject);
      setBody(d.body);
    }
  }, [open, report]);

  const handleOpenMail = () => {
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    const href = `mailto:${encodeURIComponent(to)}?${params.toString()}`;
    window.open(href, "_blank");
    toast.success("E-postutkast öppnat.");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Mejla löneunderlag
          </DialogTitle>
          <DialogDescription>
            Öppnar ett utkast i din e-postklient. Exportera PDF först om du vill bifoga rapporten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="payroll-mail-to">Till</Label>
            <Input
              id="payroll-mail-to"
              type="email"
              placeholder="lon@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payroll-mail-subject">Ämne</Label>
            <Input
              id="payroll-mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payroll-mail-body">Meddelande</Label>
            <Textarea
              id="payroll-mail-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Detta öppnar bara ett e-postutkast — inga mejl skickas automatiskt och inga bilagor läggs till.
              Exportera PDF först om du vill bifoga rapporten manuellt.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button onClick={handleOpenMail} disabled={!report}>
            <Mail className="h-4 w-4 mr-1.5" /> Öppna i e-postklient
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollMonthEmailDialog;
