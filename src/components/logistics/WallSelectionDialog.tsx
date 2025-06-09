
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Square } from 'lucide-react';

interface WallSelectionDialogProps {
  open: boolean;
  currentSegment: number;
  totalSegments: number;
  segmentDistance?: string;
  onTransparentChoice: () => void;
  onWhiteChoice: () => void;
}

export const WallSelectionDialog: React.FC<WallSelectionDialogProps> = ({
  open,
  currentSegment,
  totalSegments,
  segmentDistance,
  onTransparentChoice,
  onWhiteChoice
}) => {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Choose Wall Type - Segment {currentSegment} of {totalSegments}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">
              Select the wall type for the highlighted segment
            </p>
            {segmentDistance && (
              <p className="text-lg font-semibold text-blue-600">
                Length: {segmentDistance}
              </p>
            )}
          </div>
          
          <div className="flex gap-3 justify-center">
            <Button
              onClick={onTransparentChoice}
              variant="outline"
              className="flex-1 h-20 flex-col gap-2 border-blue-500 hover:bg-blue-50"
            >
              <Eye className="h-6 w-6 text-blue-500" />
              <span className="text-sm">Transparent</span>
              <span className="text-xs text-gray-500">See-through wall</span>
            </Button>
            
            <Button
              onClick={onWhiteChoice}
              variant="outline"
              className="flex-1 h-20 flex-col gap-2 border-gray-500 hover:bg-gray-50"
            >
              <Square className="h-6 w-6 text-gray-700" />
              <span className="text-sm">White Wall</span>
              <span className="text-xs text-gray-500">Solid wall</span>
            </Button>
          </div>
          
          <div className="text-xs text-gray-500 text-center">
            Progress: {currentSegment}/{totalSegments} segments completed
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
