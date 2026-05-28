import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  submissionId: string;
  canApprove: boolean;
  canRequestCorrection: boolean;
  /** Hidden för staff-vy. */
  size?: "default" | "sm";
}

export default function WeekFlowApproveButtons({ submissionId, canApprove, canRequestCorrection, size = "sm" }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<null | "approve" | "correction">(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [comment, setComment] = useState("");

  if (!canApprove && !canRequestCorrection) return null;

  const callStatus = async (status: "approved" | "correction_requested", review_comment: string | null) => {
    setBusy(status === "approved" ? "approve" : "correction");
    try {
      const { data, error } = await supabase.functions.invoke("update-staff-day-submission-status", {
        body: { submission_id: submissionId, status, review_comment },
      });
      if (error) throw error;
      if (data && typeof data === "object" && (data as any).error) {
        throw new Error(String((data as any).error));
      }
      toast({
        title: status === "approved" ? "Dagen är attesterad" : "Komplettering begärd",
        description: status === "approved" ? "Synligt direkt i personalens tidrapport." : "Personalen får meddelande i appen.",
      });
      qc.invalidateQueries({ queryKey: ["staff-time-flow-submissions"] });
      qc.invalidateQueries({ queryKey: ["pending-week-submissions"] });
      qc.invalidateQueries({ queryKey: ["staff-day-submissions"] });
      if (status === "correction_requested") setCorrectionOpen(false);
    } catch (e: any) {
      toast({
        title: "Kunde inte uppdatera",
        description: e?.message ?? "Okänt fel",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {canApprove && (
          <Button
            size={size}
            onClick={() => callStatus("approved", null)}
            disabled={busy !== null}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {busy === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Godkänn
          </Button>
        )}
        {canRequestCorrection && (
          <Button
            size={size}
            variant="outline"
            onClick={() => setCorrectionOpen(true)}
            disabled={busy !== null}
          >
            Begär komplettering
          </Button>
        )}
      </div>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Begär komplettering</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Skriv vad personalen behöver justera. Dagen skickas tillbaka.
            </p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="T.ex. 'Du glömde rast 12:00–12:30, justera och skicka in igen.'"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionOpen(false)} disabled={busy !== null}>
              Avbryt
            </Button>
            <Button
              onClick={() => callStatus("correction_requested", comment.trim() || null)}
              disabled={busy !== null || comment.trim().length === 0}
            >
              {busy === "correction" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Skicka tillbaka
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
