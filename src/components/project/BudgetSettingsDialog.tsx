import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectBudget } from '@/types/projectEconomy';

interface BudgetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBudget: ProjectBudget | null;
  onSave: (data: { budgeted_hours: number; hourly_rate: number; description?: string }) => void;
}

export const BudgetSettingsDialog = ({ 
  open, 
  onOpenChange, 
  currentBudget, 
  onSave 
}: BudgetSettingsDialogProps) => {
  const [budgetedHours, setBudgetedHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('350');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (currentBudget) {
      setBudgetedHours(currentBudget.budgeted_hours.toString());
      setHourlyRate(currentBudget.hourly_rate.toString());
      setDescription(currentBudget.description || '');
    } else {
      setBudgetedHours('');
      setHourlyRate('350');
      setDescription('');
    }
  }, [currentBudget, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    onSave({
      budgeted_hours: parseFloat(budgetedHours) || 0,
      hourly_rate: parseFloat(hourlyRate) || 350,
      description: description || undefined
    });

    onOpenChange(false);
  };

  const estimatedCost = (parseFloat(budgetedHours) || 0) * (parseFloat(hourlyRate) || 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Timbudget</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budgetedHours">Budgeterade timmar</Label>
              <Input
                id="budgetedHours"
                type="number"
                min="0"
                step="0.5"
                value={budgetedHours}
                onChange={(e) => setBudgetedHours(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hourlyRate">Timpris (kr)</Label>
              <Input
                id="hourlyRate"
                type="number"
                min="0"
                step="1"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="350"
              />
            </div>
          </div>

          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-center">
              <span className="text-muted-foreground">Estimerad personalkostnad:</span>{' '}
              <span className="font-bold">{formatCurrency(estimatedCost)}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beskrivning/kommentar</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="T.ex. baserat på 2 rigdagar + 1 eventdag..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit">
              Spara
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
