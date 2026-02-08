import React, { useState } from 'react';
import {
  Truck,
  Building2,
  Plus,
  Edit2,
  Trash2,
  Weight,
  Box,
  Mail,
  Phone,
  User,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import PartnerWizard from './PartnerWizard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { PremiumCard } from '@/components/ui/PremiumCard';
import { Vehicle, VehicleFormData, useVehicles } from '@/hooks/useVehicles';
import { cn } from '@/lib/utils';

const vehicleTypes = [
  { value: 'van', label: 'Skåpbil' },
  { value: 'light_truck', label: 'Lätt lastbil' },
  { value: 'pickup_crane', label: 'C-pickis med kran' },
  { value: 'crane_15m', label: 'Kranbil, stor 15m kran' },
  { value: 'crane_jib_20m', label: 'Kranbil, stor m kran m jibb 20m' },
  { value: 'body_truck', label: 'Bodbil' },
  { value: 'truck', label: 'Lastbil' },
  { value: 'trailer', label: 'Släp' },
  { value: 'trailer_13m', label: 'Trailer (13m)' },
  { value: 'truck_trailer', label: 'Lastbil med släp' },
  { value: 'crane_trailer', label: 'Kranbil med släp' },
  { value: 'other', label: 'Övrigt' },
];

const emptyFormData = (isExternal: boolean): VehicleFormData => ({
  name: '',
  registration_number: '',
  max_weight_kg: 3500,
  max_volume_m3: 15,
  vehicle_type: 'van',
  is_active: true,
  is_external: isExternal,
  company_name: '',
  contact_person: '',
  contact_email: '',
  contact_phone: '',
  crane_capacity_ton: null,
  crane_reach_m: null,
  vehicle_length_m: null,
  vehicle_height_m: null,
  vehicle_width_m: null,
  hourly_rate: null,
  daily_rate: null,
  notes: '',
  provided_vehicle_types: [],
});

interface VehiclePartnerListProps {
  vehicles: Vehicle[];
  isLoading: boolean;
  createVehicle: (data: VehicleFormData) => Promise<Vehicle | null>;
  updateVehicle: (id: string, data: Partial<VehicleFormData>) => Promise<boolean>;
  deleteVehicle: (id: string) => Promise<boolean>;
}

const VehiclePartnerList: React.FC<VehiclePartnerListProps> = ({
  vehicles,
  isLoading,
  createVehicle,
  updateVehicle,
  deleteVehicle,
}) => {
  const [showForm, setShowForm] = useState<'vehicle' | 'partner' | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<VehicleFormData>(emptyFormData(false));
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [expanded, setExpanded] = useState(true);

  const internalVehicles = vehicles.filter(v => !v.is_external);
  const externalVehicles = vehicles.filter(v => v.is_external);

  const openAddVehicle = () => {
    setEditingVehicle(null);
    setFormData(emptyFormData(false));
    setShowForm('vehicle');
  };

  const openAddPartner = () => {
    setEditingVehicle(null);
    setFormData(emptyFormData(true));
    setShowForm('partner');
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      name: vehicle.name,
      registration_number: vehicle.registration_number || '',
      max_weight_kg: vehicle.max_weight_kg,
      max_volume_m3: vehicle.max_volume_m3,
      vehicle_type: vehicle.vehicle_type,
      is_active: vehicle.is_active,
      is_external: vehicle.is_external,
      company_name: vehicle.company_name || '',
      contact_person: vehicle.contact_person || '',
      contact_email: vehicle.contact_email || '',
      contact_phone: vehicle.contact_phone || '',
      crane_capacity_ton: vehicle.crane_capacity_ton,
      crane_reach_m: vehicle.crane_reach_m,
      vehicle_length_m: vehicle.vehicle_length_m,
      vehicle_height_m: vehicle.vehicle_height_m,
      vehicle_width_m: vehicle.vehicle_width_m,
      hourly_rate: vehicle.hourly_rate,
      daily_rate: vehicle.daily_rate,
      notes: vehicle.notes || '',
      provided_vehicle_types: vehicle.provided_vehicle_types || [],
    });
    setShowForm(vehicle.is_external ? 'partner' : 'vehicle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSaveFormData(formData);
  };

  const handlePartnerWizardSubmit = async (data: VehicleFormData) => {
    await handleSaveFormData(data);
  };

  const handleSaveFormData = async (data: VehicleFormData) => {
    if (editingVehicle) {
      await updateVehicle(editingVehicle.id, data);
    } else {
      await createVehicle(data);
    }
    setShowForm(null);
    setEditingVehicle(null);
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteVehicle(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const cancelForm = () => {
    setShowForm(null);
    setEditingVehicle(null);
  };

  const totalCount = vehicles.length;

  if (isLoading) {
    return (
      <PremiumCard icon={Truck} title="Fordon & Partners">
        <div className="text-center py-8 text-muted-foreground">Laddar...</div>
      </PremiumCard>
    );
  }

  // Empty state
  if (totalCount === 0 && !showForm) {
    return (
      <PremiumCard icon={Truck} title="Inga fordon">
        <div className="text-center py-12">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-muted/50 flex items-center justify-center">
            <Truck className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-medium mb-2">Inga fordon registrerade</h3>
          <p className="text-muted-foreground mb-6">
            Lägg till ditt första fordon eller transportpartner för att börja planera transporter
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button onClick={openAddVehicle} className="rounded-xl">
              <Truck className="h-4 w-4 mr-2" />
              Lägg till fordon
            </Button>
            <Button onClick={openAddPartner} variant="outline" className="rounded-xl">
              <Building2 className="h-4 w-4 mr-2" />
              Lägg till transportpartner
            </Button>
          </div>
        </div>
      </PremiumCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Partner wizard (2-step) */}
      {showForm === 'partner' && (
        <PartnerWizard
          key={editingVehicle?.id || 'new'}
          initialData={formData}
          isEditing={!!editingVehicle}
          onSubmit={handlePartnerWizardSubmit}
          onCancel={cancelForm}
        />
      )}

      {/* Vehicle inline form (single step — internal vehicles only) */}
      {showForm === 'vehicle' && (
        <PremiumCard
          icon={Truck}
          title={editingVehicle ? 'Redigera fordon' : 'Nytt fordon'}
          headerAction={
            <Button variant="ghost" size="icon" onClick={cancelForm} className="rounded-lg h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fordonsnamn *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="T.ex. Bil 1"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Registreringsnummer</Label>
                <Input
                  value={formData.registration_number}
                  onChange={e => setFormData(p => ({ ...p, registration_number: e.target.value }))}
                  placeholder="ABC 123"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Kontaktperson</Label>
                <Input
                  value={formData.contact_person}
                  onChange={e => setFormData(p => ({ ...p, contact_person: e.target.value }))}
                  placeholder="Namn"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>E-post</Label>
                <Input
                  type="email"
                  value={formData.contact_email}
                  onChange={e => setFormData(p => ({ ...p, contact_email: e.target.value }))}
                  placeholder="email@exempel.se"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={formData.contact_phone}
                  onChange={e => setFormData(p => ({ ...p, contact_phone: e.target.value }))}
                  placeholder="070-123 45 67"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Fordonstyp</Label>
                <Select
                  value={formData.vehicle_type}
                  onValueChange={v => setFormData(p => ({ ...p, vehicle_type: v as VehicleFormData['vehicle_type'] }))}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicleTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max vikt (kg)</Label>
                <Input
                  type="number"
                  value={formData.max_weight_kg}
                  onChange={e => setFormData(p => ({ ...p, max_weight_kg: parseInt(e.target.value) || 0 }))}
                  min={0}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Max volym (m³)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.max_volume_m3}
                  onChange={e => setFormData(p => ({ ...p, max_volume_m3: parseFloat(e.target.value) || 0 }))}
                  min={0}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* Crane & dimension fields */}
            <div className="border-t border-border/30 pt-4 mt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Kran & Mått</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Krankapacitet (ton)</Label>
                  <Input type="number" step="0.1" value={formData.crane_capacity_ton ?? ''} onChange={e => setFormData(p => ({ ...p, crane_capacity_ton: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="T.ex. 25" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Kranräckvidd (m)</Label>
                  <Input type="number" step="0.1" value={formData.crane_reach_m ?? ''} onChange={e => setFormData(p => ({ ...p, crane_reach_m: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="T.ex. 15" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Fordonslängd (m)</Label>
                  <Input type="number" step="0.1" value={formData.vehicle_length_m ?? ''} onChange={e => setFormData(p => ({ ...p, vehicle_length_m: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="T.ex. 12" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Fordonshöjd (m)</Label>
                  <Input type="number" step="0.1" value={formData.vehicle_height_m ?? ''} onChange={e => setFormData(p => ({ ...p, vehicle_height_m: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="T.ex. 4" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Fordonsbredd (m)</Label>
                  <Input type="number" step="0.1" value={formData.vehicle_width_m ?? ''} onChange={e => setFormData(p => ({ ...p, vehicle_width_m: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="T.ex. 2.5" className="rounded-xl" />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Anteckningar</Label>
              <Input value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="T.ex. kräver markplattor..." className="rounded-xl" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <Switch checked={formData.is_active} onCheckedChange={c => setFormData(p => ({ ...p, is_active: c }))} />
                <Label className="text-sm">Aktivt fordon</Label>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={cancelForm} className="rounded-xl">Avbryt</Button>
                <Button type="submit" className="rounded-xl">{editingVehicle ? 'Spara ändringar' : 'Skapa fordon'}</Button>
              </div>
            </div>
          </form>
        </PremiumCard>
      )}

      {/* Vehicle list */}
      {totalCount > 0 && (
        <PremiumCard
          icon={Truck}
          title="Fordon & Transportpartners"
          count={totalCount}
          headerAction={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openAddVehicle} className="rounded-lg h-8 text-xs">
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Fordon
              </Button>
              <Button size="sm" variant="outline" onClick={openAddPartner} className="rounded-lg h-8 text-xs">
                <Building2 className="h-3.5 w-3.5 mr-1.5" />
                Partner
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          }
        >
          {expanded && (
            <div className="space-y-4">
              {/* Internal vehicles */}
              {internalVehicles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Egna fordon ({internalVehicles.length})
                  </p>
                  <div className="space-y-2">
                    {internalVehicles.map(v => (
                      <VehicleRow key={v.id} vehicle={v} onEdit={openEdit} onDelete={setDeleteTarget} />
                    ))}
                  </div>
                </div>
              )}

              {/* External partners */}
              {externalVehicles.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Transportpartners ({externalVehicles.length})
                  </p>
                  <div className="space-y-2">
                    {externalVehicles.map(v => (
                      <VehicleRow key={v.id} vehicle={v} onEdit={openEdit} onDelete={setDeleteTarget} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </PremiumCard>
      )}

      {/* Add buttons when list exists but no form open */}
      {totalCount > 0 && !showForm && !expanded && (
        <div className="flex gap-3 justify-center">
          <Button onClick={openAddVehicle} variant="outline" className="rounded-xl">
            <Plus className="h-4 w-4 mr-2" />
            Lägg till fordon
          </Button>
          <Button onClick={openAddPartner} variant="outline" className="rounded-xl">
            <Plus className="h-4 w-4 mr-2" />
            Lägg till transportpartner
          </Button>
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.is_external ? 'Ta bort transportpartner' : 'Ta bort fordon'}
            </DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort {deleteTarget?.name}? Alla transporttilldelningar för detta {deleteTarget?.is_external ? 'partner' : 'fordon'} kommer också tas bort.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete} className="rounded-xl">Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Individual vehicle row
const VehicleRow: React.FC<{
  vehicle: Vehicle;
  onEdit: (v: Vehicle) => void;
  onDelete: (v: Vehicle) => void;
}> = ({ vehicle, onEdit, onDelete }) => {
  return (
    <div className={cn(
      "flex items-center gap-4 p-3 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm transition-all",
      !vehicle.is_active && "opacity-50"
    )}>
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
        style={{ background: vehicle.is_external
          ? 'linear-gradient(135deg, hsl(217 70% 50%) 0%, hsl(217 75% 40%) 100%)'
          : 'var(--gradient-icon)'
        }}
      >
        {vehicle.is_external
          ? <Building2 className="h-5 w-5 text-white" />
          : <Truck className="h-5 w-5 text-white" />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{vehicle.name}</span>
          <Badge variant={vehicle.is_active ? 'default' : 'secondary'} className="text-[10px] h-5 px-1.5">
            {vehicle.is_active ? 'Aktiv' : 'Inaktiv'}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
          {vehicle.is_external && vehicle.company_name && (
            <span>{vehicle.company_name}</span>
          )}
          {!vehicle.is_external && vehicle.registration_number && (
            <span>{vehicle.registration_number}</span>
          )}
          {vehicle.contact_email && (
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {vehicle.contact_email}
            </span>
          )}
          {vehicle.contact_phone && (
            <span className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {vehicle.contact_phone}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Weight className="h-3 w-3" />
            {vehicle.max_weight_kg}kg
          </span>
          <span className="flex items-center gap-1">
            <Box className="h-3 w-3" />
            {vehicle.max_volume_m3}m³
          </span>
        </div>
        {/* Show provided vehicle types for partners */}
        {vehicle.is_external && vehicle.provided_vehicle_types && vehicle.provided_vehicle_types.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {vehicle.provided_vehicle_types.map(type => {
              const typeInfo = vehicleTypes.find(t => t.value === type);
              return (
                <Badge key={type} variant="outline" className="text-[10px] h-5 px-1.5 bg-primary/5 border-primary/20">
                  <Truck className="h-2.5 w-2.5 mr-1" />
                  {typeInfo?.label || type}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onEdit(vehicle)}>
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => onDelete(vehicle)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default VehiclePartnerList;
