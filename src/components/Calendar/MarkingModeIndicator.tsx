import React from 'react';
import { Clock, ArrowLeft } from 'lucide-react';

interface MarkingModeIndicatorProps {
  step: 'start' | 'end';
}

const MarkingModeIndicator: React.FC<MarkingModeIndicatorProps> = ({ step }) => {
  return (
    <div className="fixed left-[100px] top-1/2 -translate-y-1/2 z-40 animate-in slide-in-from-left duration-500">
      <div className="flex items-center gap-3">
        <div className="bg-primary text-primary-foreground px-6 py-4 rounded-lg shadow-lg 
                        border-2 border-primary animate-pulse flex items-center gap-3">
          <ArrowLeft className="h-6 w-6 animate-bounce" style={{ animationDirection: 'alternate' }} />
          <div className="flex flex-col">
            <div className="text-xs font-medium opacity-80">
              {step === 'start' ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
            </div>
            <div className="text-sm font-bold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {step === 'start' ? 'Click time for START' : 'Click time for END'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkingModeIndicator;
