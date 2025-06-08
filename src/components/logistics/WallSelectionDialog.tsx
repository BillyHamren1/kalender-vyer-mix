
import React from 'react';
import { Button } from '@/components/ui/button';

interface WallSelectionDialogProps {
  open: boolean;
  currentSide: number;
  totalSides: number;
  onTransparentChoice: () => void;
  onWhiteChoice: () => void;
}

const getSideDescription = (side: number): string => {
  switch (side) {
    case 1: return "Top Wall";
    case 2: return "Right Wall";
    case 3: return "Bottom Wall";
    case 4: return "Left Wall";
    default: return `Wall ${side}`;
  }
};

export const WallSelectionDialog: React.FC<WallSelectionDialogProps> = ({
  open,
  currentSide,
  totalSides,
  onTransparentChoice,
  onWhiteChoice,
}) => {
  if (!open) return null;

  return (
    <div className="fixed top-4 left-4 z-50 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-lg rounded-lg p-4 max-w-xs">
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900">
          {getSideDescription(currentSide)}
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Choose wall type
          <br />
          <span className="text-xs text-gray-500">
            ({currentSide} of {totalSides} walls)
          </span>
        </p>
      </div>
      
      <div className="flex gap-2 justify-center mt-3">
        <Button
          onClick={onTransparentChoice}
          variant="outline"
          size="sm"
          className="flex-1 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
        >
          Transparent
          <div className="w-3 h-1 bg-blue-500 ml-1 rounded"></div>
        </Button>
        <Button
          onClick={onWhiteChoice}
          variant="outline"
          size="sm"
          className="flex-1 bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          White
          <div className="w-3 h-1 bg-black ml-1 rounded"></div>
        </Button>
      </div>
    </div>
  );
};
