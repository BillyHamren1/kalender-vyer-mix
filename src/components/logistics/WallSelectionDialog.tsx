
import React from 'react';
import { Button } from '@/components/ui/button';
import { Eye, Square, X, ArrowRight } from 'lucide-react';

interface WallSelectionDialogProps {
  open: boolean;
  currentSegment: number;
  totalSegments: number;
  segmentDistance?: string;
  onTransparentChoice: () => void;
  onWhiteChoice: () => void;
  onCancel: () => void;
}

export const WallSelectionDialog: React.FC<WallSelectionDialogProps> = ({
  open,
  currentSegment,
  totalSegments,
  segmentDistance,
  onTransparentChoice,
  onWhiteChoice,
  onCancel
}) => {
  if (!open) return null;

  const renderSegmentIndicator = () => {
    return (
      <div className="flex items-center justify-center gap-2 mb-4">
        {Array.from({ length: totalSegments }, (_, i) => {
          const segmentNum = i + 1;
          const isCurrent = segmentNum === currentSegment;
          const isCompleted = segmentNum < currentSegment;
          
          return (
            <React.Fragment key={segmentNum}>
              <div 
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                  ${isCurrent ? 'bg-primary text-primary-foreground animate-pulse scale-125 ring-2 ring-primary ring-offset-2' : ''}
                  ${isCompleted ? 'bg-green-500 text-white' : ''}
                  ${!isCurrent && !isCompleted ? 'bg-muted text-muted-foreground' : ''}
                `}
              >
                {segmentNum}
              </div>
              {i < totalSegments - 1 && (
                <ArrowRight className={`h-4 w-4 ${segmentNum < currentSegment ? 'text-green-500' : 'text-muted-foreground'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-background border border-border rounded-lg shadow-lg p-4 w-80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Choose Wall Type
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-4">
        {renderSegmentIndicator()}
        
        <div className="text-center">
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-3">
            <p className="text-sm font-medium text-primary mb-1">
              Current Segment: #{currentSegment}
            </p>
            <p className="text-xs text-muted-foreground">
              Look for the pulsing yellow highlight on the map
            </p>
          </div>
          
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
