/**
 * RequestCorrectionDialog — modal för att begära komplettering på en dag.
 * Kräver obligatorisk kommentar. Anropar onSubmit(reviewComment) vid OK.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffName: string;
  date: string; // YYYY-MM-DD
  submitting?: boolean;
  onSubmit: (reviewComment: string) => Promise<void> | void;
}

export default function RequestCorrectionDialog({
  open,
  onOpenChange,
  staffName,
  date,
  submitting,
  onSubmit,
}: Props) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (open) setComment("");
  }, [open]);

  const canSubmit = comment.trim().length >= 3 && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Begär komplettering</DialogTitle>
          <DialogDescription>
            {staffName} · {date}. Beskriv vad personalen behöver komplettera. Kommentaren visas i mobilappen.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={5}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="T.ex. ”Restid från Tegelhagen saknas, lägg till sträcka och tid.”"
          className="resize-none"
        />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Avbryt
          </Button>
          <Button
            onClick={() => canSubmit && onSubmit(comment.trim())}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Skicka tillbaka
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
