import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Booking } from '@/types/booking';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Ruler, Mountain, RotateCcw, Edit3, Square, Circle, Minus, Trash2, Palette, ChevronDown, Pen } from 'lucide-react';

interface MapComponentProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
  centerLat?: number;
  centerLng?: number;
}

// Define proper types for Mapbox Draw events
interface DrawEvent {
  features: any[];
  type: string;
}

const MapComponent: React.FC<MapComponentProps> = ({ 
  bookings, 
  selectedBooking,
  onBookingSelect,
  centerLat,
  centerLng
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const popups = useRef<{[key: string]: mapboxgl.Popup}>({});
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [drawMode, setDrawMode] = useState<string>('simple_select');
  const [selectedColor, setSelectedColor] = useState<string>('#3bb2d0');
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const [isFreehandDrawing, setIsFreehandDrawing] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState<number[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const measurePoints = useRef<number[][]>([]);
  const measureSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  const freehandSource = useRef<mapboxgl.GeoJSONSource | null>(null);

  // Color options for drawing
  const colorOptions = [
    '#3bb2d0', // Default blue
    '#ff0000', // Red
    '#00ff00', // Green
    '#fbb03b', // Orange
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#f59e0b', // Amber
    '#ef4444', // Red variant
    '#10b981', // Emerald
    '#6366f1', // Indigo
  ];

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

  // Initialize map with drawing capabilities
  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken || isLoadingToken) return;

    // Use provided center coordinates or default
    const initialCenter: [number, number] = centerLng && centerLat 
      ? [centerLng, centerLat] 
      : [18, 60];
    // Use maximum zoom (22) when specific coordinates are provided for ultimate detail
    const initialZoom = centerLng && centerLat ? 22 : 4;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: initialCenter,
      zoom: initialZoom,
      maxZoom: 22,
      minZoom: 1,
      pitch: 0,
      bearing: 0,
      antialias: true,
      projection: 'globe'
    });

    // Initialize Mapbox Draw with dynamic styles
    const createDrawStyles = (color: string) => [
      // Polygon fill
      {
        'id': 'gl-draw-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'paint': {
          'fill-color': color,
          'fill-outline-color': color,
          'fill-opacity': 0.1
        }
      },
      {
        'id': 'gl-draw-polygon-fill-active',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'paint': {
          'fill-color': color,
          'fill-outline-color': color,
          'fill-opacity': 0.2
        }
      },
      // Polygon stroke
      {
        'id': 'gl-draw-polygon-stroke-inactive',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 2
        }
      },
      {
        'id': 'gl-draw-polygon-stroke-active',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 3
        }
      },
      // Line
      {
        'id': 'gl-draw-line-inactive',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 2
        }
      },
      {
        'id': 'gl-draw-line-active',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 3
        }
      },
      // Point
      {
        'id': 'gl-draw-point-inactive',
        'type': 'circle',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        'paint': {
          'circle-radius': 5,
          'circle-color': color,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      },
      {
        'id': 'gl-draw-point-active',
        'type': 'circle',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        'paint': {
          'circle-radius': 7,
          'circle-color': color,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      },
      // Vertices
      {
        'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
        'type': 'circle',
        'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        'paint': {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-color': color,
          'circle-stroke-width': 2
        }
      }
    ];

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: createDrawStyles(selectedColor)
    });

    // Add controls
    map.current.addControl(new mapboxgl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: true
    }), 'top-right');

    map.current.addControl(new mapboxgl.ScaleControl({
      maxWidth: 80,
      unit: 'metric'
    }), 'bottom-left');

    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Add drawing control to the map
    map.current.addControl(draw.current, 'top-right');

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

      // Add freehand drawing source
      map.current?.addSource('freehand-lines', {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': []
        }
      });

      measureSource.current = map.current?.getSource('measure-points') as mapboxgl.GeoJSONSource;
      freehandSource.current = map.current?.getSource('freehand-lines') as mapboxgl.GeoJSONSource;

      // Add measuring layers
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

      // Add freehand drawing layer
      map.current?.addLayer({
        'id': 'freehand-lines-layer',
        'type': 'line',
        'source': 'freehand-lines',
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': selectedColor,
          'line-width': 3
        }
      });
    });

    // Drawing event listeners with proper typing
    map.current.on('draw.create', (e: DrawEvent) => {
      console.log('Created feature:', e.features[0]);
      toast.success(`${e.features[0].geometry.type} created`);
    });

    map.current.on('draw.update', (e: DrawEvent) => {
      console.log('Updated feature:', e.features[0]);
      toast.success(`${e.features[0].geometry.type} updated`);
    });

    map.current.on('draw.delete', (e: DrawEvent) => {
      console.log('Deleted features:', e.features);
      toast.success(`${e.features.length} feature(s) deleted`);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, isLoadingToken, centerLat, centerLng, selectedColor]);

  // Update draw styles when color changes
  useEffect(() => {
    if (!draw.current || !map.current || !mapInitialized) return;

    // Remove existing draw control and re-add with new styles
    map.current.removeControl(draw.current);
    
    const createDrawStyles = (color: string) => [
      {
        'id': 'gl-draw-polygon-fill-inactive',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'paint': {
          'fill-color': color,
          'fill-outline-color': color,
          'fill-opacity': 0.1
        }
      },
      {
        'id': 'gl-draw-polygon-fill-active',
        'type': 'fill',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'paint': {
          'fill-color': color,
          'fill-outline-color': color,
          'fill-opacity': 0.2
        }
      },
      {
        'id': 'gl-draw-polygon-stroke-inactive',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 2
        }
      },
      {
        'id': 'gl-draw-polygon-stroke-active',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 3
        }
      },
      {
        'id': 'gl-draw-line-inactive',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 2
        }
      },
      {
        'id': 'gl-draw-line-active',
        'type': 'line',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': color,
          'line-width': 3
        }
      },
      {
        'id': 'gl-draw-point-inactive',
        'type': 'circle',
        'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        'paint': {
          'circle-radius': 5,
          'circle-color': color,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      },
      {
        'id': 'gl-draw-point-active',
        'type': 'circle',
        'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        'paint': {
          'circle-radius': 7,
          'circle-color': color,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      },
      {
        'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
        'type': 'circle',
        'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
        'paint': {
          'circle-radius': 5,
          'circle-color': '#fff',
          'circle-stroke-color': color,
          'circle-stroke-width': 2
        }
      }
    ];

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: drawMode,
      styles: createDrawStyles(selectedColor)
    });

    map.current.addControl(draw.current, 'top-right');
    draw.current.changeMode(drawMode);
  }, [selectedColor, mapInitialized, drawMode]);

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

  const calculateDistance = (point1: number[], point2: number[]): number => {
    const [lon1, lat1] = point1;
    const [lon2, lat2] = point2;
    
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatDistance = (distance: number): string => {
    if (distance < 1000) {
      return `${Math.round(distance)} m`;
    } else {
      return `${(distance / 1000).toFixed(2)} km`;
    }
  };

  const toggleMeasuring = () => {
    if (!map.current || !mapInitialized) return;

    if (!isMeasuring) {
      // Disable drawing mode when measuring
      if (draw.current) {
        draw.current.changeMode('simple_select');
        setDrawMode('simple_select');
      }
      
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

  // Freehand drawing functions
  const toggleFreehandDrawing = () => {
    if (!map.current || !mapInitialized) return;

    if (!isFreehandDrawing) {
      // Disable other drawing modes
      if (draw.current) {
        draw.current.changeMode('simple_select');
        setDrawMode('simple_select');
      }
      
      // Disable measuring
      if (isMeasuring) {
        toggleMeasuring();
      }
      
      setIsFreehandDrawing(true);
      map.current.getCanvas().style.cursor = 'crosshair';
      toast.info('Freehand drawing enabled. Click and drag to draw.');
      
      // Add freehand event listeners
      map.current.on('mousedown', handleFreehandStart);
      map.current.on('mousemove', handleFreehandMove);
      map.current.on('mouseup', handleFreehandEnd);
    } else {
      setIsFreehandDrawing(false);
      setIsDrawing(false);
      map.current.getCanvas().style.cursor = '';
      
      // Remove freehand event listeners
      map.current.off('mousedown', handleFreehandStart);
      map.current.off('mousemove', handleFreehandMove);
      map.current.off('mouseup', handleFreehandEnd);
      
      toast.info('Freehand drawing disabled');
    }
  };

  const handleFreehandStart = (e: mapboxgl.MapMouseEvent) => {
    if (!isFreehandDrawing) return;
    setIsDrawing(true);
    const coords = [e.lngLat.lng, e.lngLat.lat];
    setFreehandPoints([coords]);
  };

  const handleFreehandMove = (e: mapboxgl.MapMouseEvent) => {
    if (!isFreehandDrawing || !isDrawing) return;
    const coords = [e.lngLat.lng, e.lngLat.lat];
    setFreehandPoints(prev => [...prev, coords]);
    updateFreehandDisplay([...freehandPoints, coords]);
  };

  const handleFreehandEnd = () => {
    if (!isFreehandDrawing || !isDrawing) return;
    setIsDrawing(false);
    
    if (freehandPoints.length > 1) {
      // Create a permanent line feature
      const lineFeature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: freehandPoints
        },
        properties: {
          color: selectedColor,
          id: Date.now()
        }
      };
      
      // Add to draw control as well for consistency
      if (draw.current) {
        draw.current.add(lineFeature);
      }
      
      toast.success('Freehand line created');
    }
    
    setFreehandPoints([]);
  };

  const updateFreehandDisplay = (points: number[][]) => {
    if (!freehandSource.current || points.length < 2) return;

    const lineFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points
      },
      properties: {}
    };

    freehandSource.current.setData({
      type: 'FeatureCollection',
      features: [lineFeature]
    });
  };

  // Update freehand layer color when selected color changes
  useEffect(() => {
    if (!map.current || !mapInitialized) return;
    
    map.current.setPaintProperty('freehand-lines-layer', 'line-color', selectedColor);
  }, [selectedColor, mapInitialized]);

  // Drawing mode functions
  const setDrawingMode = (mode: string) => {
    if (!draw.current) return;
    
    // Disable measuring when entering drawing mode
    if (isMeasuring) {
      toggleMeasuring();
    }
    
    setDrawMode(mode);
    draw.current.changeMode(mode);
    
    const modeNames: { [key: string]: string } = {
      'simple_select': 'Selection',
      'draw_polygon': 'Polygon',
      'draw_line_string': 'Line',
      'draw_point': 'Point'
    };
    
    toast.success(`${modeNames[mode]} mode activated`);
    console.log(`Drawing mode changed to: ${mode}`);
  };

  const clearAllDrawings = () => {
    if (!draw.current) return;
    draw.current.deleteAll();
    measurePoints.current = [];
    updateMeasureDisplay();
    toast.success('All drawings cleared');
  };

  const resetView = () => {
    if (!map.current || !mapInitialized) return;

    map.current.flyTo({
      center: [18, 60],
      zoom: 4,
      pitch: 0,
      bearing: 0,
      duration: 2000
    });

    clearAllDrawings();
    setIsMeasuring(false);
    map.current.getCanvas().style.cursor = '';
    map.current.off('click', handleMeasureClick);
  };

  const getDisplayBookingNumber = (booking: Booking) => {
    if (booking.bookingNumber) {
      return `Booking #${booking.bookingNumber}`;
    }
    return `Booking #${booking.id.substring(0, 8)}...`;
  };

  // Add or update markers when bookings change
  useEffect(() => {
    if (!map.current || !mapInitialized) return;

    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    
    Object.values(popups.current).forEach(popup => popup.remove());
    popups.current = {};

    if (!bookings.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    
    bookings.forEach(booking => {
      if (!booking.deliveryLatitude || !booking.deliveryLongitude) return;
      
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div>
          <h3 class="font-bold">${booking.client}</h3>
          <p>${getDisplayBookingNumber(booking)}</p>
          <p>${booking.deliveryAddress || 'No address'}</p>
          <button 
            class="px-2 py-1 mt-2 text-xs bg-blue-500 text-white rounded"
            onclick="document.dispatchEvent(new CustomEvent('selectBooking', {detail: '${booking.id}'}));"
          >
            View Details
          </button>
        </div>
      `);
      
      popups.current[booking.id] = popup;

      const el = document.createElement('div');
      el.className = 'marker';
      el.style.width = '25px';
      el.style.height = '25px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = selectedBooking?.id === booking.id ? '#3b82f6' : '#ef4444';
      el.style.cursor = 'pointer';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 0 2px rgba(0, 0, 0, 0.1)';
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat([booking.deliveryLongitude, booking.deliveryLatitude])
        .setPopup(popup)
        .addTo(map.current!);
      
      markers.current.push(marker);
      bounds.extend([booking.deliveryLongitude, booking.deliveryLatitude]);
    });

    if (!bounds.isEmpty() && !centerLat && !centerLng) {
      map.current.fitBounds(bounds, {
        padding: 100,
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [bookings, selectedBooking, mapInitialized, centerLat, centerLng]);

  useEffect(() => {
    const handleSelectBooking = (e: Event) => {
      const bookingId = (e as CustomEvent).detail;
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        onBookingSelect(booking);
      }
    };

    document.addEventListener('selectBooking', handleSelectBooking);
    return () => {
      document.removeEventListener('selectBooking', handleSelectBooking);
    };
  }, [bookings, onBookingSelect]);

  useEffect(() => {
    if (!map.current || !selectedBooking || !mapInitialized) return;
    
    if (selectedBooking.deliveryLatitude && selectedBooking.deliveryLongitude) {
      map.current.flyTo({
        center: [selectedBooking.deliveryLongitude, selectedBooking.deliveryLatitude],
        zoom: 22,
        duration: 1000
      });
      
      const popup = popups.current[selectedBooking.id];
      if (popup) {
        popup.addTo(map.current);
      }
    }
  }, [selectedBooking, mapInitialized]);

  if (isLoadingToken) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <span className="ml-2">Loading map...</span>
      </div>
    );
  }

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-6">
          <h3 className="text-lg font-medium text-gray-900">Mapbox API Key Required</h3>
          <p className="mt-2 text-sm text-gray-500">
            Please add the MAPBOX_PUBLIC_TOKEN secret to your Supabase project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded-lg overflow-hidden relative">
      {/* Enhanced Map Controls - Now Collapsible */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        {/* Basic Controls (always visible) */}
        <div className="flex flex-col gap-1">
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
        </div>

        {/* Collapsible Drawing Controls */}
        <Collapsible open={isDrawingOpen} onOpenChange={setIsDrawingOpen}>
          <CollapsibleTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="bg-white/90 backdrop-blur-sm shadow-md w-full justify-between"
            >
              <div className="flex items-center">
                <Edit3 className="h-4 w-4 mr-1" />
                Drawing Tools
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isDrawingOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-2 mt-2">
            {/* Color Picker */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1 mb-1">
                <Palette className="h-4 w-4" />
                <span className="text-xs font-medium">Color:</span>
              </div>
              <div className="grid grid-cols-5 gap-1 p-2 bg-white/90 backdrop-blur-sm rounded-md shadow-md">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-6 h-6 rounded-sm border-2 ${
                      selectedColor === color ? 'border-gray-800' : 'border-white'
                    } hover:scale-110 transition-transform`}
                    style={{ backgroundColor: color }}
                    title={`Select ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* Drawing Mode Controls */}
            <div className="flex flex-col gap-1">
              <Button
                onClick={() => setDrawingMode('simple_select')}
                size="sm"
                variant={drawMode === 'simple_select' ? "default" : "outline"}
                className="bg-white/90 backdrop-blur-sm shadow-md"
              >
                <Edit3 className="h-4 w-4 mr-1" />
                Select
              </Button>
              
              <Button
                onClick={toggleFreehandDrawing}
                size="sm"
                variant={isFreehandDrawing ? "default" : "outline"}
                className="bg-white/90 backdrop-blur-sm shadow-md"
              >
                <Pen className="h-4 w-4 mr-1" />
                Freehand
              </Button>
              
              <Button
                onClick={() => setDrawingMode('draw_polygon')}
                size="sm"
                variant={drawMode === 'draw_polygon' ? "default" : "outline"}
                className="bg-white/90 backdrop-blur-sm shadow-md"
              >
                <Square className="h-4 w-4 mr-1" />
                Polygon
              </Button>
              
              <Button
                onClick={() => setDrawingMode('draw_line_string')}
                size="sm"
                variant={drawMode === 'draw_line_string' ? "default" : "outline"}
                className="bg-white/90 backdrop-blur-sm shadow-md"
              >
                <Minus className="h-4 w-4 mr-1" />
                Line
              </Button>
              
              <Button
                onClick={() => setDrawingMode('draw_point')}
                size="sm"
                variant={drawMode === 'draw_point' ? "default" : "outline"}
                className="bg-white/90 backdrop-blur-sm shadow-md"
              >
                <Circle className="h-4 w-4 mr-1" />
                Point
              </Button>
            </div>

            {/* Clear and Reset Controls */}
            <div className="flex flex-col gap-1 border-t border-white/20 pt-2">
              <Button
                onClick={clearAllDrawings}
                size="sm"
                variant="outline"
                className="bg-white/90 backdrop-blur-sm shadow-md text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
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
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default MapComponent;
