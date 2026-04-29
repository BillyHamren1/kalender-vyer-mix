/**
 * DistanceWarningDialog
 *
 * Visas när användaren försöker starta en aktivitet utanför geofencen
 * (>ENTER_RADIUS från projektets/platsens koordinater).
 *
 * POLICY: Användaren MÅSTE förklara varför hen startar trots att GPS säger
 * att hen inte är på plats. Anledningen sparas som workday_flag av
 * useTimerStartFlow så den syns i staffens dagsöversikt + admin-rapporter.
 */
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';

interface DistanceWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeName: string;
  distanceMeters: number;
  /** Anropas med användarens (obligatoriska) anledning. */
  onConfirm: (reason: string) => void;
}

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const MIN_REASON_LENGTH = 5;

const DistanceWarningDialog = ({
  open, onOpenChange, placeName, distanceMeters, onConfirm,
}: DistanceWarningDialogProps) => {
  const [reason, setReason] = useState('');

  // Reset reason whenever the dialog opens fresh
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const trimmed = reason.trim();
  const canConfirm = trimmed.length >= MIN_REASON_LENGTH;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(trimmed);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[380px] rounded-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <AlertDialogTitle className="text-base">Du verkar inte vara på plats</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm">
            GPS säger att du är ca <strong className="text-foreground">{formatDistance(distanceMeters)}</strong> från <strong className="text-foreground">"{placeName}"</strong>.
            Förklara varför du startar projektet ändå — anledningen sparas som kommentar och syns för arbetsledaren.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1.5">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="T.ex. GPS strular, jag är på plats men i källaren, tar över för kollega…"
            rows={3}
            autoFocus
            className="resize-none"
          />
          {!canConfirm && trimmed.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Minst {MIN_REASON_LENGTH} tecken.</p>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Starta ändå
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DistanceWarningDialog;
