
import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface WallSelectionDialogProps {
  open: boolean;
  currentSide: number;
  totalSides: number;
  onTransparentChoice: () => void;
  onWhiteChoice: () => void;
}

export const WallSelectionDialog: React.FC<WallSelectionDialogProps> = ({
  open,
  currentSide,
  totalSides,
  onTransparentChoice,
  onWhiteChoice,
}) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Wall Selection - Side {currentSide} of {totalSides}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose the type for this wall:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-4 justify-center">
          <Button
            onClick={onTransparentChoice}
            variant="outline"
            className="flex-1 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
          >
            Transparent
            <div className="w-4 h-1 bg-blue-500 ml-2 rounded"></div>
          </Button>
          <Button
            onClick={onWhiteChoice}
            variant="outline"
            className="flex-1 bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            White
            <div className="w-4 h-1 bg-black ml-2 rounded"></div>
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
