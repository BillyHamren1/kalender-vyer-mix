import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllOrganizationLocations,
  createOrganizationLocation,
  updateOrganizationLocation,
  deleteOrganizationLocation,
  OrganizationLocation,
} from '@/services/organizationLocationService';
import { Building2, Plus, Trash2, MapPin, Edit2, X, Check, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const OrganizationLocationsManager = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', latitude: '', longitude: '', radius_meters: '100' });
  const [isGeocoding, setIsGeocoding] = useState(false);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['organization-locations'],
    queryFn: fetchAllOrganizationLocations,
  });

  const createMutation = useMutation({
    mutationFn: createOrganizationLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-locations'] });
      toast.success('Plats skapad');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => updateOrganizationLocation(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-locations'] });
      toast.success('Plats uppdaterad');
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrganizationLocation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-locations'] });
      toast.success('Plats inaktiverad');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm({ name: '', address: '', latitude: '', longitude: '', radius_meters: '100' });
  };

  const openEdit = (loc: OrganizationLocation) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      address: loc.address || '',
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius_meters: String(loc.radius_meters),
    });
    setDialogOpen(true);
  };

  const geocodeAddress = useCallback(async () => {
    if (!form.address.trim()) {
      toast.error('Ange en adress först');
      return;
    }
    if (!MAPBOX_TOKEN) {
      toast.error('Mapbox-token saknas');
      return;
    }
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(form.address)}.json?access_token=${MAPBOX_TOKEN}&country=se&limit=1`
      );
      const json = await res.json();
      const feature = json.features?.[0];
      if (!feature) {
        toast.error('Kunde inte hitta adressen');
        return;
      }
      const [lng, lat] = feature.center;
      setForm(f => ({
        ...f,
        latitude: String(lat),
        longitude: String(lng),
        address: feature.place_name || f.address,
      }));
      toast.success('Koordinater hämtade');
    } catch {
      toast.error('Geocoding misslyckades');
    } finally {
      setIsGeocoding(false);
    }
  }, [form.address]);

  const handleSave = () => {
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (!form.name.trim() || isNaN(lat) || isNaN(lng)) {
      toast.error('Namn, latitud och longitud krävs');
      return;
    }
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      latitude: lat,
      longitude: lng,
      radius_meters: parseInt(form.radius_meters) || 100,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, updates: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          Fasta platser
        </h3>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3 h-3" />
          Ny plats
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Laddar...</p>
      ) : locations.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inga fasta platser konfigurerade.</p>
      ) : (
        <div className="space-y-1.5">
          {locations.map(loc => (
            <div
              key={loc.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card text-xs"
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">{loc.name}</span>
                {loc.address && <span className="text-muted-foreground ml-1.5">— {loc.address}</span>}
              </div>
              <Badge variant={loc.is_active ? 'default' : 'secondary'} className="text-[10px] h-5">
                {loc.radius_meters}m
              </Badge>
              {!loc.is_active && (
                <Badge variant="outline" className="text-[10px] h-5 text-muted-foreground">Inaktiv</Badge>
              )}
              <button onClick={() => openEdit(loc)} className="p-1 hover:bg-muted rounded">
                <Edit2 className="w-3 h-3 text-muted-foreground" />
              </button>
              {loc.is_active && (
                <button onClick={() => deleteMutation.mutate(loc.id)} className="p-1 hover:bg-destructive/10 rounded">
                  <Trash2 className="w-3 h-3 text-destructive/70" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingId ? 'Redigera plats' : 'Ny fast plats'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Namn</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kontoret" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Adress</Label>
              <div className="flex gap-1.5">
                <Input
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Storgatan 1, Stockholm"
                  className="h-9 text-sm flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); geocodeAddress(); } }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-2.5 shrink-0"
                  onClick={geocodeAddress}
                  disabled={isGeocoding}
                >
                  {isGeocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Skriv adress och klicka sök — koordinater fylls i automatiskt</p>
            </div>
            {(form.latitude || form.longitude) && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Latitud</Label>
                  <Input type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} className="h-8 text-xs bg-muted/40" />
                </div>
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Longitud</Label>
                  <Input type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} className="h-8 text-xs bg-muted/40" />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Radie (meter)</Label>
              <Input type="number" value={form.radius_meters} onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={closeDialog}>Avbryt</Button>
              <Button size="sm" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                <Check className="w-3.5 h-3.5 mr-1" />
                {editingId ? 'Spara' : 'Skapa'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationLocationsManager;
