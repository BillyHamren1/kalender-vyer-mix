import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StepTransportRoute, { MediaItem } from './StepTransportRoute';
import { toast } from 'sonner';

interface InspectionWizardProps {
  bookingId: string;
  onClose: () => void;
}

const TOTAL_STEPS = 1; // Will grow as more steps are added

const InspectionWizard = ({ bookingId, onClose }: InspectionWizardProps) => {
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [transportMedia, setTransportMedia] = useState<MediaItem[]>([]);
  const [transportInfo, setTransportInfo] = useState('');

  const addMedia = (item: MediaItem) => setTransportMedia((prev) => [...prev, item]);
  const removeMedia = (id: string) => setTransportMedia((prev) => prev.filter((m) => m.id !== id));

  const handleNext = () => {
    if (currentStep >= TOTAL_STEPS) {
      // Final step – placeholder for save
      toast.success('Besiktning steg 1 klar');
      onClose();
      return;
    }
    setCurrentStep((s) => s + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-card flex flex-col">
      {/* Header */}
      <div className="bg-primary rounded-b-3xl shadow-md">
        <div style={{ height: 'env(safe-area-inset-top, 44px)', minHeight: '44px' }} />
        <div className="px-4 pb-4 flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-1 rounded-xl active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight">Besiktning</h1>
            <p className="text-[11px] text-primary-foreground/50">Steg {currentStep} av {TOTAL_STEPS}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {currentStep === 1 && (
          <StepTransportRoute
            media={transportMedia}
            onAddMedia={addMedia}
            onRemoveMedia={removeMedia}
            transportInfo={transportInfo}
            onTransportInfoChange={setTransportInfo}
          />
        )}
      </div>

      {/* Bottom actions */}
      <div className="px-4 pb-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
            Avbryt
          </Button>
          <Button onClick={handleNext} className="flex-1 rounded-xl gap-1.5">
            {currentStep >= TOTAL_STEPS ? 'Klar' : 'Nästa'}
            {currentStep < TOTAL_STEPS && <ArrowRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionWizard;
