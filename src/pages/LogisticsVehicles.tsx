import React, { useState } from 'react';
import { Truck, Plus, Edit2, Trash2, Weight, Box, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVehicles, Vehicle, VehicleFormData } from '@/hooks/useVehicles';
import { cn } from '@/lib/utils';

const vehicleTypes = [
  { value: 'van', label: 'Skåpbil' },
  { value: 'truck', label: 'Lastbil' },
  { value: 'trailer', label: 'Släp' },
  { value: 'other', label: 'Övrigt' },
];

const LogisticsVehicles: React.FC = () => {
  const { vehicles, isLoading, createVehicle, updateVehicle, deleteVehicle } = useVehicles();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal');

  const [formData, setFormData] = useState<VehicleFormData>({
    name: '',
    registration_number: '',
    max_weight_kg: 3500,
    max_volume_m3: 15,
    vehicle_type: 'van',
    is_active: true,
    is_external: false,
    company_name: '',
  });

  const internalVehicles = vehicles.filter(v => !v.is_external);
  const externalVehicles = vehicles.filter(v => v.is_external);

  const resetForm = () => {
    setFormData({
      name: '',
      registration_number: '',
      max_weight_kg: 3500,
      max_volume_m3: 15,
      vehicle_type: 'van',
      is_active: true,
      is_external: activeTab === 'external',
      company_name: '',
    });
    setEditingVehicle(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormData(prev => ({ ...prev, is_external: activeTab === 'external' }));
    setIsFormOpen(true);
  };

  const openEditForm = (vehicle: Vehicle) => {
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
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingVehicle) {
      await updateVehicle(editingVehicle.id, formData);
    } else {
      await createVehicle(formData);
    }
    
    setIsFormOpen(false);
    resetForm();
  };

  const confirmDelete = (vehicle: Vehicle) => {
    setVehicleToDelete(vehicle);
    setIsDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (vehicleToDelete) {
      await deleteVehicle(vehicleToDelete.id);
      setIsDeleteOpen(false);
      setVehicleToDelete(null);
    }
  };

  const getVehicleIcon = (type: string, isExternal: boolean) => {
    if (isExternal) return '🏢';
    switch (type) {
      case 'truck': return '🚚';
      case 'trailer': return '🚛';
      case 'van': return '🚐';
      default: return '🚗';
    }
  };

  const renderVehicleGrid = (vehicleList: Vehicle[], emptyMessage: string, emptySubMessage: string) => {
    if (vehicleList.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            {activeTab === 'external' ? (
              <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            ) : (
              <Truck className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            )}
            <h3 className="text-lg font-medium mb-2">{emptyMessage}</h3>
            <p className="text-muted-foreground mb-4">{emptySubMessage}</p>
            <Button onClick={openCreateForm}>
              <Plus className="h-4 w-4 mr-2" />
              {activeTab === 'external' ? 'Lägg till transportbolag' : 'Lägg till fordon'}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {vehicleList.map(vehicle => (
          <Card 
            key={vehicle.id}
            className={cn(
              "transition-opacity",
              !vehicle.is_active && "opacity-60"
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getVehicleIcon(vehicle.vehicle_type, vehicle.is_external)}</span>
                  <div>
                    <CardTitle className="text-base">{vehicle.name}</CardTitle>
                    {vehicle.is_external && vehicle.company_name && (
                      <p className="text-xs text-muted-foreground">
                        {vehicle.company_name}
                      </p>
                    )}
                    {!vehicle.is_external && vehicle.registration_number && (
                      <p className="text-xs text-muted-foreground">
                        {vehicle.registration_number}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <Badge variant={vehicle.is_active ? 'default' : 'secondary'}>
                    {vehicle.is_active ? 'Aktiv' : 'Inaktiv'}
                  </Badge>
                  {vehicle.is_external && (
                    <Badge variant="outline" className="text-xs">
                      Extern
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Weight className="h-4 w-4 text-muted-foreground" />
                  <span>{vehicle.max_weight_kg} kg</span>
                </div>
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-muted-foreground" />
                  <span>{vehicle.max_volume_m3} m³</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => openEditForm(vehicle)}
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Redigera
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => confirmDelete(vehicle)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Fordonshantering
          </h1>
          <p className="text-muted-foreground">
            Hantera fordon och externa transportbolag
          </p>
        </div>
        <Button onClick={openCreateForm}>
          <Plus className="h-4 w-4 mr-2" />
          {activeTab === 'external' ? 'Lägg till transportbolag' : 'Lägg till fordon'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'internal' | 'external')}>
        <TabsList>
          <TabsTrigger value="internal" className="gap-2">
            <Truck className="h-4 w-4" />
            Egna fordon ({internalVehicles.length})
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-2">
            <Building2 className="h-4 w-4" />
            Transportbolag ({externalVehicles.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Laddar...</div>
          ) : (
            renderVehicleGrid(
              internalVehicles,
              'Inga egna fordon registrerade',
              'Lägg till ditt första fordon för att börja planera transporter.'
            )
          )}
        </TabsContent>

        <TabsContent value="external" className="mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Laddar...</div>
          ) : (
            renderVehicleGrid(
              externalVehicles,
              'Inga transportbolag registrerade',
              'Lägg till externa transportbolag för att planera leveranser med partners.'
            )
          )}
        </TabsContent>
      </Tabs>
      {/* Create/Edit Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingVehicle 
                ? (formData.is_external ? 'Redigera transportbolag' : 'Redigera fordon')
                : (formData.is_external ? 'Lägg till transportbolag' : 'Lägg till fordon')
              }
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{formData.is_external ? 'Benämning' : 'Namn'} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={formData.is_external ? 'T.ex. DHL Expressleverans' : 'T.ex. Bil 1, Volvo lastbil'}
                required
              />
            </div>

            {formData.is_external && (
              <div className="space-y-2">
                <Label htmlFor="company_name">Företagsnamn</Label>
                <Input
                  id="company_name"
                  value={formData.company_name}
                  onChange={e => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                  placeholder="T.ex. DHL, Schenker, PostNord"
                />
              </div>
            )}

            {!formData.is_external && (
              <div className="space-y-2">
                <Label htmlFor="registration">Registreringsnummer</Label>
                <Input
                  id="registration"
                  value={formData.registration_number}
                  onChange={e => setFormData(prev => ({ ...prev, registration_number: e.target.value }))}
                  placeholder="ABC 123"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="type">Fordonstyp</Label>
              <Select 
                value={formData.vehicle_type}
                onValueChange={value => setFormData(prev => ({ 
                  ...prev, 
                  vehicle_type: value as VehicleFormData['vehicle_type'] 
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Max vikt (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={formData.max_weight_kg}
                  onChange={e => setFormData(prev => ({ 
                    ...prev, 
                    max_weight_kg: parseInt(e.target.value) || 0 
                  }))}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volume">Max volym (m³)</Label>
                <Input
                  id="volume"
                  type="number"
                  step="0.1"
                  value={formData.max_volume_m3}
                  onChange={e => setFormData(prev => ({ 
                    ...prev, 
                    max_volume_m3: parseFloat(e.target.value) || 0 
                  }))}
                  min={0}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="active">{formData.is_external ? 'Aktivt bolag' : 'Aktivt fordon'}</Label>
              <Switch
                id="active"
                checked={formData.is_active}
                onCheckedChange={checked => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Avbryt
              </Button>
              <Button type="submit">
                {editingVehicle ? 'Spara ändringar' : (formData.is_external ? 'Skapa transportbolag' : 'Skapa fordon')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {vehicleToDelete?.is_external ? 'Ta bort transportbolag' : 'Ta bort fordon'}
            </DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort {vehicleToDelete?.name}? 
              Detta kommer också ta bort alla transporttilldelningar för detta {vehicleToDelete?.is_external ? 'transportbolag' : 'fordon'}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticsVehicles;
