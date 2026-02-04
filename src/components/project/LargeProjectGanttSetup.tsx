import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, ChevronRight, Check, Info, GanttChart } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';

interface GanttStep {
  key: string;
  name: string;
  start_date: string;
  end_date: string;
  is_milestone: boolean;
}

interface LargeProjectGanttSetupProps {
  largeProjectId: string;
  existingSteps?: GanttStep[];
  onSave: (steps: GanttStep[]) => Promise<void>;
  onCancel?: () => void;
}

const DEFAULT_STEPS = [
  { key: 'establishment', name: 'Etablering', is_milestone: false },
  { key: 'construction', name: 'Byggnation', is_milestone: true },
  { key: 'event', name: 'Event', is_milestone: true },
  { key: 'deestablishment', name: 'Avetablering', is_milestone: false },
];

export const LargeProjectGanttSetup: React.FC<LargeProjectGanttSetupProps> = ({
  largeProjectId,
  existingSteps = [],
  onSave,
  onCancel
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<GanttStep[]>(() => {
    if (existingSteps.length > 0) {
      return existingSteps;
    }
    return DEFAULT_STEPS.map(s => ({
      ...s,
      start_date: '',
      end_date: ''
    }));
  });
  const [isSaving, setIsSaving] = useState(false);

  const updateStep = (key: string, field: 'start_date' | 'end_date', value: string) => {
    setSteps(prev => prev.map(s => 
      s.key === key ? { ...s, [field]: value } : s
    ));
  };

  const currentStepData = steps[currentStep];
  const isComplete = steps.every(s => s.start_date && s.end_date);
  const progress = (currentStep / steps.length) * 100;

  const handleNext = () => {
    if (!currentStepData.start_date || !currentStepData.end_date) {
      toast.error('Fyll i både start- och slutdatum');
      return;
    }
    
    if (new Date(currentStepData.end_date) < new Date(currentStepData.start_date)) {
      toast.error('Slutdatum måste vara efter startdatum');
      return;
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSave = async () => {
    if (!isComplete) {
      toast.error('Alla steg måste ha datum');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(steps);
      toast.success('Ganttschema sparat!');
    } catch (error) {
      toast.error('Kunde inte spara schemat');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDatePreview = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return format(new Date(dateStr), 'd MMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GanttChart className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Konfigurera Ganttschema</CardTitle>
        </div>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((step, idx) => (
            <React.Fragment key={step.key}>
              <button
                onClick={() => setCurrentStep(idx)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  idx === currentStep 
                    ? 'bg-primary text-primary-foreground' 
                    : step.start_date && step.end_date
                      ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.start_date && step.end_date && idx !== currentStep ? (
                  <Check className="h-3 w-3" />
                ) : null}
                {step.name}
              </button>
              {idx < steps.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Current step form */}
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{currentStepData.name}</span>
              {currentStepData.is_milestone && (
                <Badge variant="secondary" className="text-xs">
                  <Info className="h-3 w-3 mr-1" />
                  Milstolpe
                </Badge>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              Steg {currentStep + 1} av {steps.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date" className="text-xs font-medium">
                Startdatum
              </Label>
              <Input
                id="start_date"
                type="date"
                value={currentStepData.start_date}
                onChange={(e) => updateStep(currentStepData.key, 'start_date', e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date" className="text-xs font-medium">
                Slutdatum
              </Label>
              <Input
                id="end_date"
                type="date"
                value={currentStepData.end_date}
                onChange={(e) => updateStep(currentStepData.key, 'end_date', e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {currentStepData.is_milestone && (
            <p className="text-xs text-muted-foreground mt-3">
              Milstolpar är informationspunkter i schemat och kan inte markeras som slutförda.
            </p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            Föregående
          </Button>

          <div className="flex items-center gap-2">
            {onCancel && (
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Avbryt
              </Button>
            )}
            
            {currentStep < steps.length - 1 ? (
              <Button size="sm" onClick={handleNext}>
                Nästa
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} disabled={!isComplete || isSaving}>
                {isSaving ? 'Sparar...' : 'Spara schema'}
              </Button>
            )}
          </div>
        </div>

        {/* Preview all steps */}
        {steps.some(s => s.start_date && s.end_date) && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Översikt</h4>
            <div className="space-y-1">
              {steps.map(step => (
                <div key={step.key} className="flex items-center justify-between text-xs">
                  <span className={step.start_date && step.end_date ? 'text-foreground' : 'text-muted-foreground'}>
                    {step.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDatePreview(step.start_date)} – {formatDatePreview(step.end_date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
