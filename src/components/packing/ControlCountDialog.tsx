import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, ShieldCheck, X, Check, AlertTriangle, PenLine } from "lucide-react";
import {
  startControlCount,
  answerControlItem,
  completeControlCount,
  getControlNextItem,
  type ControlSession,
  type ControlNextItem,
  type ControlProgress,
} from "@/services/scannerService";
import { getStoredStaff } from "@/services/mobileApiService";
import { toast } from "sonner";

interface Props {
  packingId: string;
  packingName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful completion (completed or failed) so parent can refresh */
  onCompleted?: (result: "completed" | "failed") => void;
  /** Hoppa per-rad-frågorna och svara "Ja" på allt automatiskt — bara signering kvar. */
  quickApprove?: boolean;
}

type Stage = "starting" | "answering" | "no_comment" | "signing" | "completed" | "error";

export const ControlCountDialog = ({
  packingId,
  packingName,
  open,
  onOpenChange,
  onCompleted,
}: Props) => {
  const [stage, setStage] = useState<Stage>("starting");
  const [session, setSession] = useState<ControlSession | null>(null);
  const [item, setItem] = useState<ControlNextItem | null>(null);
  const [progress, setProgress] = useState<ControlProgress>({ answered: 0, total: 0, index: 0 });
  const [comment, setComment] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"completed" | "failed" | null>(null);

  // Reset + boot when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const boot = async () => {
      setStage("starting");
      setError(null);
      setComment("");
      setResult(null);
      const staff = getStoredStaff();
      if (staff?.name) setSignatureName(staff.name);
      const res = await startControlCount(packingId);
      if (cancelled) return;
      if (!res.success || !res.session) {
        setError(res.error || "Kunde inte starta kontrollräkning");
        setStage("error");
        return;
      }
      setSession(res.session);
      setProgress(res.progress || { answered: 0, total: 0, index: 0 });
      if (!res.next_item) {
        setStage("signing");
      } else {
        setItem(res.next_item);
        setStage("answering");
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, [open, packingId]);

  const refreshNext = useCallback(async (sId: string) => {
    const res = await getControlNextItem(sId);
    if (!res.success) return;
    setProgress(res.progress);
    if (res.done || !res.next_item) {
      setItem(null);
      setStage("signing");
    } else {
      setItem(res.next_item);
      setStage("answering");
    }
  }, []);

  const handleYes = async () => {
    if (!session || !item) return;
    setSubmitting(true);
    const res = await answerControlItem(session.id, item.id, "yes");
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error || "Kunde inte spara");
      return;
    }
    setProgress(res.progress);
    if (res.done || !res.next_item) {
      setItem(null);
      setStage("signing");
    } else {
      setItem(res.next_item);
      setComment("");
    }
  };

  const handleNoClick = () => {
    setComment("");
    setStage("no_comment");
  };

  const handleNoSubmit = async () => {
    if (!session || !item) return;
    if (!comment.trim()) {
      toast.error("Kommentar krävs");
      return;
    }
    setSubmitting(true);
    const res = await answerControlItem(session.id, item.id, "no", comment.trim());
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error || "Kunde inte spara");
      return;
    }
    setProgress(res.progress);
    setComment("");
    if (res.done || !res.next_item) {
      setItem(null);
      setStage("signing");
    } else {
      setItem(res.next_item);
      setStage("answering");
    }
  };

  const handleComplete = async () => {
    if (!session) return;
    if (!signatureName.trim()) {
      toast.error("Ange ditt namn för signering");
      return;
    }
    setSubmitting(true);
    const res = await completeControlCount(session.id, signatureName.trim());
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error || "Kunde inte slutföra");
      return;
    }
    setResult(res.result || "completed");
    setStage("completed");
    onCompleted?.(res.result || "completed");
  };

  const handleClose = () => {
    // Tillåt stängning oavsett stage — sessionen ligger kvar och kan återupptas.
    onOpenChange(false);
  };

  const pct =
    progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Kontrollräkning
          </DialogTitle>
          <DialogDescription className="text-xs">
            {packingName ? `${packingName} • ` : ""}
            Verifiera att rätt antal är packat.
          </DialogDescription>
        </DialogHeader>

        {stage !== "completed" && stage !== "starting" && stage !== "error" && (
          <div className="px-5 pt-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>
                {progress.answered} av {progress.total} kontrollerade
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )}

        <div className="px-5 py-5">
          {stage === "starting" && (
            <div className="py-8 flex flex-col items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 mb-2 animate-spin" />
              Startar kontroll…
            </div>
          )}

          {stage === "error" && (
            <div className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" className="mt-4" onClick={handleClose}>
                Stäng
              </Button>
            </div>
          )}

          {stage === "answering" && item && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-base leading-relaxed">
                  <span className="font-semibold tabular-nums">{item.expected_quantity}</span>{" "}
                  <span className="font-semibold">{item.product_name}</span>{" "}
                  är packade. Stämmer det?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 gap-2 border-rose-300 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={handleNoClick}
                  disabled={submitting}
                >
                  <X className="h-5 w-5" />
                  Nej
                </Button>
                <Button
                  size="lg"
                  className="h-14 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleYes}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  Ja
                </Button>
              </div>
            </div>
          )}

          {stage === "no_comment" && item && (
            <div className="space-y-3">
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <p className="text-sm">
                  Avvikelse för <span className="font-semibold">{item.product_name}</span> (förväntat{" "}
                  <span className="tabular-nums">{item.expected_quantity}</span>).
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Vad stämmer inte? (kommentar krävs)
                </label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="T.ex. Saknar 2 st, hittade fel modell…"
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStage("answering")}
                  disabled={submitting}
                >
                  Avbryt
                </Button>
                <Button
                  onClick={handleNoSubmit}
                  disabled={submitting || !comment.trim()}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Spara avvikelse
                </Button>
              </div>
            </div>
          )}

          {stage === "signing" && session && (
            <div className="space-y-4">
              <div className="text-center">
                <ShieldCheck className="h-10 w-10 mx-auto text-primary mb-1" />
                <p className="text-sm font-medium">Alla rader kontrollerade</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Signera för att slutföra kontrollräkningen.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Signera som</label>
                <Input
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="Ditt namn"
                  className="mt-1"
                />
              </div>
              <Button
                className="w-full h-12 gap-2"
                onClick={handleComplete}
                disabled={submitting || !signatureName.trim()}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PenLine className="h-4 w-4" />
                )}
                Signera & slutför
              </Button>
            </div>
          )}

          {stage === "completed" && (
            <div className="py-4 text-center">
              {result === "completed" ? (
                <>
                  <div className="h-12 w-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                    <Check className="h-6 w-6 text-emerald-600" />
                  </div>
                  <p className="font-semibold text-emerald-700">Kontroll klar</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allt stämmer — packlistan är kontrollräknad.
                  </p>
                </>
              ) : (
                <>
                  <div className="h-12 w-12 mx-auto rounded-full bg-rose-100 flex items-center justify-center mb-2">
                    <AlertTriangle className="h-6 w-6 text-rose-600" />
                  </div>
                  <p className="font-semibold text-rose-700">Kontrollavvikelse</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Minst ett svar var Nej. Jobbet flaggas som avvikelse.
                  </p>
                </>
              )}
              <Button variant="outline" className="mt-4" onClick={handleClose}>
                Stäng
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ControlCountDialog;
