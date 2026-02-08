import React, { useState } from 'react';
import {
  Building2,
  Truck,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { VehicleFormData } from '@/hooks/useVehicles';
import { cn } from '@/lib/utils';

const VEHICLE_TYPES = [
  { value: 'van', label: 'Skåpbil', description: 'Standard skåpbil för lättare leveranser' },
  { value: 'light_truck', label: 'Lätt lastbil', description: 'Mindre lastbil upp till 3.5 ton' },
  { value: 'pickup_crane', label: 'C-pickis med kran', description: 'Pickup med kranutrustning' },
  { value: 'crane_15m', label: 'Kranbil 15m kran', description: 'Stor kranbil med 15m räckvidd' },
  { value: 'crane_jib_20m', label: 'Kranbil m jibb 20m', description: 'Kranbil med jibb, 20m räckvidd' },
  { value: 'body_truck', label: 'Bodbil', description: 'Lastbil med boddel' },
  { value: 'truck', label: 'Lastbil', description: 'Standard lastbil' },
  { value: 'trailer', label: 'Släp', description: 'Fristående släpvagn' },
  { value: 'trailer_13m', label: 'Trailer (13m)', description: '13 meter trailer' },
  { value: 'truck_trailer', label: 'Lastbil med släp', description: 'Lastbil med påhängt släp' },
  { value: 'crane_trailer', label: 'Kranbil med släp', description: 'Kranbil med tillkopplat släp' },
  { value: 'other', label: 'Övrigt', description: 'Annan typ av fordon' },
];

interface PartnerWizardProps {
  initialData: VehicleFormData;
  isEditing: boolean;
  onSubmit: (data: VehicleFormData) => void;
  onCancel: () => void;
}

const PartnerWizard: React.FC<PartnerWizardProps> = ({
  initialData,
  isEditing,
  onSubmit,
  onCancel,
}) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<VehicleFormData>(initialData);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    initialData.provided_vehicle_types || []
  );

  const canProceed = formData.name.trim().length > 0;

  const handleToggleType = (typeValue: string) => {
    setSelectedTypes(prev =>
      prev.includes(typeValue)
        ? prev.filter(t => t !== typeValue)
        : [...prev, typeValue]
    );
  };

  const handleSelectAll = () => {
    if (selectedTypes.length === VEHICLE_TYPES.length) {
      setSelectedTypes([]);
    } else {
      setSelectedTypes(VEHICLE_TYPES.map(t => t.value));
    }
  };

  const handleFinalSubmit = () => {
    // Set primary vehicle_type to first selected, or keep existing
    const primaryType = selectedTypes.length > 0
      ? selectedTypes[0] as VehicleFormData['vehicle_type']
      : formData.vehicle_type;

    onSubmit({
      ...formData,
      vehicle_type: primaryType,
      provided_vehicle_types: selectedTypes,
    });
  };

  return (
    <PremiumCard
      icon={Building2}
      title={isEditing ? 'Redigera transportpartner' : 'Ny transportpartner'}
      headerAction={
        <div className="flex items-center gap-3">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              step === 1 ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
            )}>
              {step > 1 ? <Check className="h-3.5 w-3.5" /> : '1'}
            </span>
            <span className="hidden sm:inline">Info</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <span className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
              step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              2
            </span>
            <span className="hidden sm:inline">Fordon</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-lg h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      {/* Step 1: Partner info */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Benämning *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="T.ex. Bylund och Kokk"
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Företagsnamn</Label>
              <Input
                value={formData.company_name || ''}
                onChange={e => setFormData(p => ({ ...p, company_name: e.target.value }))}
                placeholder="T.ex. Bylund och Kokk AB"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Kontaktperson</Label>
              <Input
                value={formData.contact_person || ''}
                onChange={e => setFormData(p => ({ ...p, contact_person: e.target.value }))}
                placeholder="Namn"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>E-post</Label>
              <Input
                type="email"
                value={formData.contact_email || ''}
                onChange={e => setFormData(p => ({ ...p, contact_email: e.target.value }))}
                placeholder="email@exempel.se"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={formData.contact_phone || ''}
                onChange={e => setFormData(p => ({ ...p, contact_phone: e.target.value }))}
                placeholder="070-123 45 67"
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Anteckningar</Label>
            <Input
              value={formData.notes || ''}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              placeholder="T.ex. kräver markplattor, max 30 ton axeltryck..."
              className="rounded-xl"
            />
          </div>

          {/* Active toggle + Next button */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.is_active}
                onCheckedChange={c => setFormData(p => ({ ...p, is_active: c }))}
              />
              <Label className="text-sm">Aktiv partner</Label>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl">
                Avbryt
              </Button>
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceed}
                className="rounded-xl gap-2"
              >
                Nästa: Välj fordon
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Select vehicle types */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Vilka fordonstyper tillhandahåller {formData.name || 'denna partner'}?
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Klicka i alla fordonstyper som partnern kan erbjuda
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="text-xs h-7"
            >
              {selectedTypes.length === VEHICLE_TYPES.length ? 'Avmarkera alla' : 'Markera alla'}
            </Button>
          </div>

          {/* Vehicle type grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {VEHICLE_TYPES.map(type => {
              const isSelected = selectedTypes.includes(type.value);
              return (
                <label
                  key={type.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/40 bg-background/60 hover:border-border"
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggleType(type.value)}
                    className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Truck className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("text-sm font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>
                        {type.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {type.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Selected count */}
          {selectedTypes.length > 0 && (
            <p className="text-xs text-primary font-medium">
              {selectedTypes.length} fordonstyp{selectedTypes.length !== 1 ? 'er' : ''} vald{selectedTypes.length !== 1 ? 'a' : ''}
            </p>
          )}

          {/* Back + Submit */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              className="rounded-xl gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Tillbaka
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} className="rounded-xl">
                Avbryt
              </Button>
              <Button
                type="button"
                onClick={handleFinalSubmit}
                className="rounded-xl gap-2"
              >
                <Check className="h-4 w-4" />
                {isEditing ? 'Spara ändringar' : 'Skapa partner'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PremiumCard>
  );
};

export default PartnerWizard;
