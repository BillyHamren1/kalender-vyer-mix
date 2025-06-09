
import React from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Square, X } from 'lucide-react';

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
  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-background border border-border rounded-lg shadow-lg p-4 w-80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Choose Wall Type - Segment {currentSegment} of {totalSegments}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => {}} // This will be handled by the parent component
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Select the wall type for the highlighted segment
          </p>
          {segmentDistance && (
            <p className="text-lg font-semibold text-primary">
              Length: {segmentDistance}
            </p>
          )}
        </div>
        
        <div className="flex gap-3 justify-center">
          <Button
            onClick={onTransparentChoice}
            variant="outline"
            className="flex-1 h-20 flex-col gap-2 border-primary hover:bg-primary/10"
          >
            <Eye className="h-6 w-6 text-primary" />
            <span className="text-sm">Transparent</span>
            <span className="text-xs text-muted-foreground">See-through wall</span>
          </Button>
          
          <Button
            onClick={onWhiteChoice}
            variant="outline"
            className="flex-1 h-20 flex-col gap-2 border-muted-foreground hover:bg-muted/50"
          >
            <Square className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm">White Wall</span>
            <span className="text-xs text-muted-foreground">Solid wall</span>
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground text-center">
          Progress: {currentSegment}/{totalSegments} segments completed
        </div>
      </div>
    </div>
  );
};
