import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllOrganizationLocations,
  createOrganizationLocation,
  updateOrganizationLocation,
  deleteOrganizationLocation,
  OrganizationLocation,
  LocationType,
  LOCATION_TYPE_LABELS,
} from '@/services/organizationLocationService';
import { Building2, Plus, Trash2, MapPin, Edit2, Check, Search, Loader2, Home, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import GeofenceMapEditor, { GeofenceValue } from './GeofenceMapEditor';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

const LOCATION_TYPE_ORDER: LocationType[] = [
  'warehouse',
  'project_site',
  'customer_site',
  'supplier',
  'private_residence',
  'other',
];

const OrganizationLocationsManager = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [showAsProject, setShowAsProject] = useState(false);
  const [locationType, setLocationType] = useState<LocationType>('other');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [geofence, setGeofence] = useState<GeofenceValue>({
    mode: 'circle',
    latitude: 0,
    longitude: 0,
    radius_meters: 100,
    polygon: null,
  });
  const [centerOn, setCenterOn] = useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const isResidence = locationType === 'private_residence';

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
    setName('');
    setAddress('');
    setShowAsProject(false);
    setLocationType('other');
    setNotes('');
    setIsActive(true);
    setGeofence({ mode: 'circle', latitude: 0, longitude: 0, radius_meters: 100, polygon: null });
    setCenterOn(null);
  };

  const openEdit = (loc: OrganizationLocation) => {
    setEditingId(loc.id);
    setName(loc.name);
    setAddress(loc.address || '');
    setShowAsProject(loc.show_as_project || false);
    setLocationType((loc.location_type as LocationType) || 'other');
    setNotes(typeof loc.metadata?.notes === 'string' ? loc.metadata.notes : '');
    setIsActive(loc.is_active);
    setGeofence({
      mode: (loc.geofence_mode as any) || 'circle',
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      radius_meters: loc.radius_meters,
      polygon: loc.geofence_polygon || null,
    });
    setCenterOn(null);
    setDialogOpen(true);
  };

  const handleTypeChange = (next: LocationType) => {
    setLocationType(next);
    if (next === 'private_residence') {
      // Force polygon mode for residences; clear radius
      setGeofence(g => ({ ...g, mode: 'polygon' }));
      setShowAsProject(false);
    }
  };

  const geocodeAddress = useCallback(async () => {
    if (!address.trim()) {
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
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=se&limit=1`
      );
      const json = await res.json();
      const feature = json.features?.[0];
      if (!feature) {
        toast.error('Kunde inte hitta adressen');
        return;
      }
      const [lng, lat] = feature.center;
      setAddress(feature.place_name || address);
      setCenterOn({ lat, lng });
      // For circle mode also seed centroid
      setGeofence(g => g.mode === 'circle' ? { ...g, latitude: lat, longitude: lng } : g);
      toast.success('Karta centrerad');
    } catch {
      toast.error('Geocoding misslyckades');
    } finally {
      setIsGeocoding(false);
    }
  }, [address]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Namn krävs');
      return;
    }
    if (isResidence && !geofence.polygon) {
      toast.error('Boende kräver att du ritar en polygon på kartan');
      return;
    }
    if (!isResidence && geofence.mode === 'polygon' && !geofence.polygon) {
      toast.error('Rita en polygon på kartan eller välj cirkel-läge');
      return;
    }
    if (!isResidence && geofence.mode === 'circle' && (!geofence.latitude || !geofence.longitude)) {
      toast.error('Sök en adress eller använd Min position för att placera cirkeln');
      return;
    }
    const payload = {
      name: name.trim(),
      address: address.trim() || undefined,
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      radius_meters: isResidence ? 0 : (geofence.radius_meters || 100),
      show_as_project: isResidence ? false : showAsProject,
      geofence_mode: isResidence ? ('polygon' as const) : geofence.mode,
      geofence_polygon: geofence.polygon,
      location_type: locationType,
      is_private_residence: isResidence,
      privacy_level: (isResidence ? 'private' : 'normal') as 'private' | 'normal',
      metadata: { notes: notes.trim() || undefined },
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, updates: { ...payload, is_active: isActive } });
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
          {locations.map(loc => {
            const residence = loc.is_private_residence || loc.location_type === 'private_residence';
            return (
            <div
              key={loc.id}
              className="flex items-center gap-2 p-2 rounded-lg border border-border/60 bg-card text-xs"
            >
              {residence ? (
                <Home className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium text-foreground">{loc.name}</span>
                {!residence && loc.address && <span className="text-muted-foreground ml-1.5">— {loc.address}</span>}
              </div>
              {loc.location_type && loc.location_type !== 'other' && (
                <Badge variant="outline" className="text-[10px] h-5">
                  {LOCATION_TYPE_LABELS[loc.location_type as LocationType] ?? loc.location_type}
                </Badge>
              )}
              {residence ? (
                <Badge variant="outline" className="text-[10px] h-5 border-amber-500/40 text-amber-700 dark:text-amber-400">Boende</Badge>
              ) : (
                <Badge variant={loc.is_active ? 'default' : 'secondary'} className="text-[10px] h-5">
                  {loc.geofence_mode === 'polygon' ? 'Polygon' : `${loc.radius_meters}m`}
                </Badge>
              )}
              {loc.show_as_project && (
                <Badge variant="outline" className="text-[10px] h-5 text-primary border-primary/30">Tidprojekt</Badge>
              )}
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
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">{editingId ? 'Redigera plats' : 'Ny fast plats'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Namn</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Kontoret" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={locationType} onValueChange={(v) => handleTypeChange(v as LocationType)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPE_ORDER.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">{LOCATION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isResidence && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Boende</div>
                  <div className="opacity-90">
                    Boende används för att skilja privat vistelse från arbetstid nära arbetsplatser.
                    Rita en polygon runt boendet på kartan. Radie används inte för boende.
                  </div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Adress</Label>
              <div className="flex gap-1.5">
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
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
              <p className="text-[10px] text-muted-foreground mt-1">
                {isResidence
                  ? 'Sök adressen → kartan centreras. Rita sedan polygon runt boendet.'
                  : 'Sök adressen → kartan centreras. Rita sedan polygon för exakt geofence.'}
              </p>
            </div>

            <GeofenceMapEditor
              value={isResidence ? { ...geofence, mode: 'polygon' } : geofence}
              onChange={(v) => setGeofence(isResidence ? { ...v, mode: 'polygon' } : v)}
              centerOn={centerOn}
              height={340}
            />

            {!isResidence && geofence.mode === 'circle' && (
              <div>
                <Label className="text-xs">Radie (meter)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={String(geofence.radius_meters)}
                  onChange={e => {
                    const n = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                    setGeofence(g => ({ ...g, radius_meters: n }));
                  }}
                  className="h-9 text-sm"
                />
              </div>
            )}

            <div>
              <Label className="text-xs">Anteckning</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Valfri anteckning" className="h-9 text-sm" />
            </div>

            {!isResidence && (
              <div className="flex items-center justify-between py-1">
                <div>
                  <Label className="text-xs">Visa som projekt i tidappen</Label>
                  <p className="text-[10px] text-muted-foreground">Alla personal kan registrera tid här som ett vanligt jobb</p>
                </div>
                <Switch checked={showAsProject} onCheckedChange={setShowAsProject} />
              </div>
            )}

            {editingId && (
              <div className="flex items-center justify-between py-1">
                <div>
                  <Label className="text-xs">Aktiv</Label>
                  <p className="text-[10px] text-muted-foreground">Inaktiva platser döljs i listor och kartor</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
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
