import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Route, MapPin, Navigation, ExternalLink, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { PageContainer } from '@/components/ui/PageContainer';
import { PageHeader } from '@/components/ui/PageHeader';
import { PremiumCard, SimpleCard } from '@/components/ui/PremiumCard';
import { useVehicles } from '@/hooks/useVehicles';
import { useTransportAssignments, TransportAssignment } from '@/hooks/useTransportAssignments';
import { useVehicleTracking } from '@/hooks/useVehicleTracking';
import { cn } from '@/lib/utils';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LogisticsRoutes: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const vehicleMarker = useRef<mapboxgl.Marker | null>(null);

  const { activeVehicles, isLoading: vehiclesLoading } = useVehicles();
  const { 
    assignments, 
    getAssignmentsByVehicle, 
    optimizeRoute,
    isLoading: assignmentsLoading 
  } = useTransportAssignments(selectedDate);
  const { positions } = useVehicleTracking();

  // Fetch mapbox token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error) throw error;
        setMapboxToken(data.token);
        mapboxgl.accessToken = data.token;
      } catch (error) {
        console.error('Failed to fetch mapbox token:', error);
      }
    };
    fetchToken();
  }, []);

  // Auto-select first vehicle
  useEffect(() => {
    if (activeVehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(activeVehicles[0].id);
    }
  }, [activeVehicles, selectedVehicleId]);

  const vehicleAssignments = selectedVehicleId 
    ? getAssignmentsByVehicle(selectedVehicleId) 
    : [];

  const selectedVehicle = activeVehicles.find(v => v.id === selectedVehicleId);
  const vehiclePosition = positions.find(p => p.id === selectedVehicleId);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [18, 59.3],
      zoom: 10,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken]);

  // Update markers when assignments change
  useEffect(() => {
    if (!map.current) return;

    // Clear existing markers
    markers.current.forEach(m => m.remove());
    markers.current = [];

    const bounds = new mapboxgl.LngLatBounds();
    let hasValidCoords = false;

    vehicleAssignments.forEach((assignment, idx) => {
      const lat = assignment.booking?.delivery_latitude;
      const lng = assignment.booking?.delivery_longitude;
      
      if (lat && lng) {
        hasValidCoords = true;
        
        const el = document.createElement('div');
        el.className = 'flex items-center justify-center';
        el.innerHTML = `
          <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shadow-lg">
            ${assignment.stop_order || idx + 1}
          </div>
        `;
        
        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 })
              .setHTML(`
                <strong>${assignment.booking?.client || 'Okänd'}</strong><br/>
                ${assignment.booking?.deliveryaddress || ''}<br/>
                <em>${getStatusLabel(assignment.status)}</em>
              `)
          )
          .addTo(map.current!);
        
        markers.current.push(marker);
        bounds.extend([lng, lat]);
      }
    });

    if (hasValidCoords && !bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  }, [vehicleAssignments]);

  // Update vehicle position marker
  useEffect(() => {
    if (!map.current) return;

    // Remove old vehicle marker
    vehicleMarker.current?.remove();
    vehicleMarker.current = null;

    if (vehiclePosition && vehiclePosition.isOnline) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="relative">
          <div class="w-10 h-10 rounded-full bg-green-500 border-4 border-white shadow-lg flex items-center justify-center text-xl">
            🚐
          </div>
          <div class="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping"></div>
        </div>
      `;
      
      vehicleMarker.current = new mapboxgl.Marker(el)
        .setLngLat([vehiclePosition.lng, vehiclePosition.lat])
        .addTo(map.current);
    }
  }, [vehiclePosition]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'delivered': return '✅ Levererad';
      case 'in_transit': return '🔄 På väg';
      case 'skipped': return '⏭️ Hoppades över';
      default: return '⏳ Väntar';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'delivered': return 'default';
      case 'in_transit': return 'secondary';
      case 'skipped': return 'destructive';
      default: return 'outline';
    }
  };

  const handleOptimize = async () => {
    if (!selectedVehicleId) return;
    
    setIsOptimizing(true);
    await optimizeRoute(selectedVehicleId, format(selectedDate, 'yyyy-MM-dd'));
    setIsOptimizing(false);
  };

  const generateGoogleMapsUrl = () => {
    const stops = vehicleAssignments
      .filter(a => a.booking?.delivery_latitude && a.booking?.delivery_longitude)
      .sort((a, b) => a.stop_order - b.stop_order);

    if (stops.length === 0) return null;

    const waypoints = stops.map(s => 
      `${s.booking!.delivery_latitude},${s.booking!.delivery_longitude}`
    );

    if (waypoints.length === 1) {
      return `https://www.google.com/maps/dir/?api=1&destination=${waypoints[0]}&travelmode=driving`;
    }

    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediates = waypoints.slice(1, -1).join('|');

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${intermediates}&travelmode=driving`;
  };

  const googleMapsUrl = generateGoogleMapsUrl();

  const isLoading = vehiclesLoading || assignmentsLoading;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
          <SelectTrigger className="w-[200px] rounded-xl">
            <SelectValue placeholder="Välj fordon" />
          </SelectTrigger>
          <SelectContent>
            {activeVehicles.map(vehicle => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input 
          type="date" 
          value={format(selectedDate, 'yyyy-MM-dd')}
          onChange={e => setSelectedDate(new Date(e.target.value))}
          className="px-3 py-2 border rounded-xl bg-background h-10"
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stop List */}
        <PremiumCard
          icon={MapPin}
          title="Stopp"
          count={vehicleAssignments.length}
          headerAction={
            vehicleAssignments.length > 1 && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleOptimize}
                disabled={isOptimizing}
                className="rounded-lg"
              >
                {isOptimizing ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3 mr-1" />
                )}
                Optimera
              </Button>
            )
          }
          className="lg:col-span-1"
        >
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Laddar...</div>
            ) : vehicleAssignments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Inga stopp för detta fordon</p>
              </div>
            ) : (
              vehicleAssignments.map((assignment, idx) => (
                <SimpleCard
                  key={assignment.id}
                  className={cn(
                    "p-3 transition-colors",
                    assignment.status === 'delivered' && "bg-emerald-50/50 border-emerald-200",
                    assignment.status === 'in_transit' && "bg-blue-50/50 border-blue-200"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
                      {assignment.stop_order || idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">
                        {assignment.booking?.client || 'Okänd kund'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {assignment.booking?.deliveryaddress}
                        {assignment.booking?.delivery_city && `, ${assignment.booking.delivery_city}`}
                      </p>
                      <Badge 
                        variant={getStatusBadgeVariant(assignment.status)}
                        className="mt-1 text-xs"
                      >
                        {getStatusLabel(assignment.status)}
                      </Badge>
                    </div>
                  </div>
                </SimpleCard>
              ))
            )}
          </div>

          {/* Actions */}
          {googleMapsUrl && (
            <div className="pt-4 mt-4 border-t">
              <Button 
                className="w-full rounded-xl" 
                onClick={() => window.open(googleMapsUrl, '_blank')}
              >
                <Navigation className="h-4 w-4 mr-2" />
                Öppna i Google Maps
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </div>
          )}
        </PremiumCard>

        {/* Map */}
        <PremiumCard
          title="Karta"
          headerAction={
            vehiclePosition?.isOnline && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                {selectedVehicle?.name} är live
              </Badge>
            )
          }
          className="lg:col-span-2"
          noPadding
        >
          <div 
            ref={mapContainer} 
            className="h-[500px] rounded-b-xl"
          />
        </PremiumCard>
      </div>

      {/* Route Summary */}
      {vehicleAssignments.length > 0 && (
        <PremiumCard className="mt-6" noPadding>
          <div className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Stopp:</span>{' '}
                  <span className="font-medium">{vehicleAssignments.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Levererade:</span>{' '}
                  <span className="font-medium text-emerald-600">
                    {vehicleAssignments.filter(a => a.status === 'delivered').length}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Väntar:</span>{' '}
                  <span className="font-medium">
                    {vehicleAssignments.filter(a => a.status === 'pending').length}
                  </span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {format(selectedDate, 'EEEE d MMMM yyyy', { locale: sv })}
              </div>
            </div>
          </div>
        </PremiumCard>
      )}
    </div>
  );
};

export default LogisticsRoutes;
