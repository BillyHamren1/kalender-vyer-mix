import { useState } from "react";
import { Check, Car, MoveRight, HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResolveSuggestion, type ResolveAction } from "@/hooks/admin/useResolveSuggestion";
import { MoveSuggestionDialog } from "./MoveSuggestionDialog";

interface Props {
  suggestionId: string;
  staffId: string;
  date: string;
  organizationId: string | null;
}

export function SuggestionActionButtons({ suggestionId, staffId, date, organizationId }: Props) {
  const resolve = useResolveSuggestion();
  const [moveOpen, setMoveOpen] = useState(false);
  const [unclearPrompt, setUnclearPrompt] = useState(false);

  const fire = (action: ResolveAction, payload?: Record<string, unknown>) => {
    resolve.mutate({ suggestionId, action, staffId, date, payload });
  };

  const isPending = resolve.isPending;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="default"
        className="h-8 gap-1.5"
        disabled={isPending}
        onClick={() => fire("accept")}
      >
        <Check className="h-3.5 w-3.5" /> Acceptera
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        disabled={isPending}
        onClick={() => fire("mark_travel")}
      >
        <Car className="h-3.5 w-3.5" /> Markera som restid
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        disabled={isPending}
        onClick={() => setMoveOpen(true)}
      >
        <MoveRight className="h-3.5 w-3.5" /> Flytta till annan plats
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        disabled={isPending}
        onClick={() => setUnclearPrompt(true)}
      >
        <HelpCircle className="h-3.5 w-3.5" /> Markera som oklar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 text-muted-foreground"
        disabled={isPending}
        onClick={() => fire("ignore")}
      >
        <X className="h-3.5 w-3.5" /> Ignorera
      </Button>

      {moveOpen && (
        <MoveSuggestionDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          organizationId={organizationId}
          reportDate={date}
          loading={isPending}
          onConfirm={(payload) => {
            fire("move_to_other_site", payload);
            setMoveOpen(false);
          }}
        />
      )}

      {unclearPrompt && (
        <UnclearNotePrompt
          loading={isPending}
          onCancel={() => setUnclearPrompt(false)}
          onConfirm={(note) => {
            fire("mark_unclear", note ? { note } : {});
            setUnclearPrompt(false);
          }}
        />
      )}
    </div>
  );
}

function UnclearNotePrompt({ onCancel, onConfirm, loading }: { onCancel: () => void; onConfirm: (note: string) => void; loading: boolean }) {
  const [note, setNote] = useState("");
  return (
    <div className="basis-full mt-2 p-3 rounded-md border bg-muted/40 space-y-2">
      <label className="text-xs font-medium block">Notering (valfri)</label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full text-sm bg-background border rounded-md px-2 py-1"
        placeholder="Varför är tiden oklar?"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>Avbryt</Button>
        <Button size="sm" onClick={() => onConfirm(note.trim())} disabled={loading}>Spara</Button>
      </div>
    </div>
  );
}

export default SuggestionActionButtons;
