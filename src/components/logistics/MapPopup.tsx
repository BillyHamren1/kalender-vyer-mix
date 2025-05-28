
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MapPin, Loader, Mountain, Ruler, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface MapPopupProps {
  latitude: number;
  longitude: number;
  address: string;
  children: React.ReactNode;
}

const MapPopup: React.FC<MapPopupProps> = ({ 
  latitude, 
  longitude, 
  address, 
  children 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const measurePoints = useRef<number[][]>([]);
  const measureSource = useRef<mapboxgl.GeoJSONSource | null>(null);

  // Fetch Mapbox token from edge function
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        setIsLoadingToken(true);
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        
        if (error) {
          console.error('Error fetching Mapbox token:', error);
          toast.error('Failed to load map: Could not get access token');
          return;
        }
        
        setMapboxToken(data.token);
        mapboxgl.accessToken = data.token;
      } catch (error) {
        console.error('Error in token fetch:', error);
        toast.error('Failed to load map');
      } finally {
        setIsLoadingToken(false);
      }
    };

    fetchMapboxToken();
  }, []);

  // Initialize map when dialog opens
  useEffect(() => {
    if (!isOpen || !mapContainer.current || map.current || !mapboxToken || isLoadingToken) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [longitude, latitude],
      zoom: 15,
      maxZoom: 22,
      minZoom: 1,
      pitch: 0,
      bearing: 0,
      antialias: true,
      projection: 'globe'
    });

    // Add enhanced navigation controls
    map.current.addControl(new mapboxgl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: true
    }), 'top-right');

    // Add scale control
    map.current.addControl(new mapboxgl.ScaleControl({
      maxWidth: 80,
      unit: 'metric'
    }), 'bottom-left');

    // Add fullscreen control
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Add marker for the location
    new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat([longitude, latitude])
      .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div>
          <h3 class="font-bold">Delivery Location</h3>
          <p>${address}</p>
        </div>
      `))
      .addTo(map.current);

    map.current.on('load', () => {
      setMapInitialized(true);
      
      // Add 3D terrain source
      map.current?.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });

      // Add measuring source
      map.current?.addSource('measure-points', {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': []
        }
      });

      measureSource.current = map.current?.getSource('measure-points') as mapboxgl.GeoJSONSource;

      // Add measuring line layer
      map.current?.addLayer({
        'id': 'measure-lines',
        'type': 'line',
        'source': 'measure-points',
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': '#ff0000',
          'line-width': 3
        }
      });

      // Add measuring points layer
      map.current?.addLayer({
        'id': 'measure-points-layer',
        'type': 'circle',
        'source': 'measure-points',
        'paint': {
          'circle-radius': 6,
          'circle-color': '#ff0000',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, [isOpen, latitude, longitude, address, mapboxToken, isLoadingToken]);

  // Toggle 3D terrain
  const toggle3D = () => {
    if (!map.current || !mapInitialized) return;

    if (!is3DEnabled) {
      map.current.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
      map.current.easeTo({
        pitch: 60,
        bearing: 45,
        duration: 1000
      });
      setIs3DEnabled(true);
      toast.success('3D terrain enabled');
    } else {
      map.current.setTerrain(null);
      map.current.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000
      });
      setIs3DEnabled(false);
      toast.success('3D terrain disabled');
    }
  };

  // Calculate distance between two points
  const calculateDistance = (point1: number[], point2: number[]): number => {
    const [lon1, lat1] = point1;
    const [lon2, lat2] = point2;
    
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Format distance for display
  const formatDistance = (distance: number): string => {
    if (distance < 1000) {
      return `${Math.round(distance)} m`;
    } else {
      return `${(distance / 1000).toFixed(2)} km`;
    }
  };

  // Toggle measuring tool
  const toggleMeasuring = () => {
    if (!map.current || !mapInitialized) return;

    if (!isMeasuring) {
      setIsMeasuring(true);
      map.current.getCanvas().style.cursor = 'crosshair';
      toast.info('Click on the map to start measuring. Click again to add points.');
      
      map.current.on('click', handleMeasureClick);
    } else {
      setIsMeasuring(false);
      map.current.getCanvas().style.cursor = '';
      map.current.off('click', handleMeasureClick);
      
      measurePoints.current = [];
      updateMeasureDisplay();
      toast.info('Measuring disabled');
    }
  };

  // Handle measure click
  const handleMeasureClick = (e: mapboxgl.MapMouseEvent) => {
    const coords = [e.lngLat.lng, e.lngLat.lat];
    measurePoints.current.push(coords);
    
    if (measurePoints.current.length > 1) {
      const totalDistance = measurePoints.current.reduce((total, point, index) => {
        if (index === 0) return 0;
        return total + calculateDistance(measurePoints.current[index - 1], point);
      }, 0);
      
      toast.success(`Distance: ${formatDistance(totalDistance)}`);
    }
    
    updateMeasureDisplay();
  };

  // Update measure display
  const updateMeasureDisplay = () => {
    if (!measureSource.current) return;

    const features = [];
    
    measurePoints.current.forEach((point, index) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: point
        },
        properties: {
          id: index
        }
      });
    });

    if (measurePoints.current.length > 1) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: measurePoints.current
        },
        properties: {}
      });
    }

    measureSource.current.setData({
      type: 'FeatureCollection',
      features: features
    });
  };

  // Reset view
  const resetView = () => {
    if (!map.current || !mapInitialized) return;

    map.current.flyTo({
      center: [longitude, latitude],
      zoom: 15,
      pitch: 0,
      bearing: 0,
      duration: 2000
    });

    measurePoints.current = [];
    updateMeasureDisplay();
    setIsMeasuring(false);
    map.current.getCanvas().style.cursor = '';
    map.current.off('click', handleMeasureClick);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Delivery Location Map
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 relative">
          {isLoadingToken ? (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <Loader className="h-8 w-8 animate-spin text-gray-400" />
              <span className="ml-2">Loading map...</span>
            </div>
          ) : !mapboxToken ? (
            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
              <div className="text-center p-6">
                <h3 className="text-lg font-medium text-gray-900">Mapbox API Key Required</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Please add the MAPBOX_PUBLIC_TOKEN secret to your Supabase project.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Map Controls */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <Button
                  onClick={toggle3D}
                  size="sm"
                  variant={is3DEnabled ? "default" : "outline"}
                  className="bg-white/90 backdrop-blur-sm shadow-md"
                >
                  <Mountain className="h-4 w-4 mr-1" />
                  3D Terrain
                </Button>
                
                <Button
                  onClick={toggleMeasuring}
                  size="sm"
                  variant={isMeasuring ? "default" : "outline"}
                  className="bg-white/90 backdrop-blur-sm shadow-md"
                >
                  <Ruler className="h-4 w-4 mr-1" />
                  Measure
                </Button>
                
                <Button
                  onClick={resetView}
                  size="sm"
                  variant="outline"
                  className="bg-white/90 backdrop-blur-sm shadow-md"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>

              <div ref={mapContainer} className="h-full w-full rounded-lg" />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MapPopup;
