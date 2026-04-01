import React, { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Lock, CheckCircle2 } from 'lucide-react';

interface ProjectClosureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  canClose: boolean;
  isClosing: boolean;
  onClose: (notes?: string) => void;
}

export const ProjectClosureDialog: React.FC<ProjectClosureDialogProps> = ({
  open,
  onOpenChange,
  projectName,
  canClose,
  isClosing,
  onClose,
}) => {
  const [notes, setNotes] = useState('');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {canClose ? (
              <CheckCircle2 className="h-5 w-5 text-teal-600" />
            ) : (
              <Lock className="h-5 w-5 text-red-600" />
            )}
            Stäng projekt
          </AlertDialogTitle>
          <AlertDialogDescription>
            {canClose
              ? `Alla krav är uppfyllda. Vill du stänga ${projectName}?`
              : `${projectName} kan inte stängas ännu. Lös blockerarna nedan.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {canClose && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Anteckning vid stängning (valfritt)
            </label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="T.ex. avvikelser, kommentarer..."
              className="min-h-[60px] text-sm resize-none"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isClosing}>Avbryt</AlertDialogCancel>
          {canClose && (
            <AlertDialogAction
              onClick={() => onClose(notes || undefined)}
              disabled={isClosing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isClosing ? 'Stänger...' : 'Stäng projekt'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
