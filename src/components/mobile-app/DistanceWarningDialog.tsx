import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface DistanceWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeName: string;
  distanceMeters: number;
  onConfirm: () => void;
}

const formatDistance = (meters: number) => {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
};

const DistanceWarningDialog = ({ open, onOpenChange, placeName, distanceMeters, onConfirm }: DistanceWarningDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[340px] rounded-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <AlertDialogTitle className="text-base">You don't seem to be nearby</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm">
            According to GPS you are approx. <strong className="text-foreground">{formatDistance(distanceMeters)}</strong> from <strong className="text-foreground">"{placeName}"</strong>.
            {'\n\n'}Do you want to start the timer anyway?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Start anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DistanceWarningDialog;
