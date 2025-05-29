
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Booking } from '@/types/booking';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { MapControls } from './MapControls';
import { MapMarkers } from './MapMarkers';
import { calculateDistance, formatDistance, createDrawStyles } from './MapUtils';
import { BookingDetailPanel } from './BookingDetailPanel';

interface MapComponentProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
  centerLat?: number;
  centerLng?: number;
  onSnapshotSaved?: (attachment: any) => void;
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
  centerLng,
  onSnapshotSaved
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
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
  const [currentMapStyle, setCurrentMapStyle] = useState<string>('mapbox://styles/mapbox/satellite-streets-v12');
  const measurePoints = useRef<number[][]>([]);
  const measureSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  const freehandSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);
  const [isDraggingMeasurePoint, setIsDraggingMeasurePoint] = useState(false);
  const [dragPointIndex, setDragPointIndex] = useState<number | null>(null);

  // Refs for dynamic event listeners
  const dragHandlers = useRef<{
    mousemove?: (e: MouseEvent) => void;
    mouseup?: (e: MouseEvent) => void;
  }>({});

  // Handle window messages for iframe resize
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'RESIZE_MAP' && map.current && mapInitialized) {
        console.log('Received resize message, resizing map...');
        // Small delay to ensure container is properly sized
        setTimeout(() => {
          if (map.current) {
            map.current.resize();
            console.log('Map resized successfully');
          }
        }, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mapInitialized]);

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
    // Use zoom level 12 when specific coordinates are provided (better scale accuracy for satellite imagery)
    const initialZoom = centerLng && centerLat ? 12 : 4;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: currentMapStyle, // Always use satellite as default
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
          'circle-radius': 8,
          'circle-color': '#ff0000',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });

      // Add layer for distance labels
      map.current?.addLayer({
        'id': 'measure-labels',
        'type': 'symbol',
        'source': 'measure-points',
        'layout': {
          'text-field': ['get', 'distance'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center',
          'text-offset': [0, -1.5]
        },
        'paint': {
          'text-color': '#ff0000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
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

      // Add ONLY mousedown event listener for measure points (not persistent mousemove/mouseup)
      map.current?.on('mousedown', 'measure-points-layer', handleMeasurePointMouseDown);

      // Change cursor to pointer when hovering over measure points
      map.current?.on('mouseenter', 'measure-points-layer', () => {
        if (map.current && !isMeasuring) {
          map.current.getCanvas().style.cursor = 'grab';
        }
      });

      map.current?.on('mouseleave', 'measure-points-layer', () => {
        if (map.current && !isDraggingMeasurePoint) {
          map.current.getCanvas().style.cursor = isMeasuring ? 'crosshair' : '';
        }
      });

      // Trigger initial resize in case we're in an iframe
      setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 200);
    });

    // Force map resize to ensure it fills the container properly
    setTimeout(() => {
      if (map.current) {
        map.current.resize();
      }
    }, 100);

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
      // Clean up any active drag listeners
      cleanupDragListeners();
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, isLoadingToken, centerLat, centerLng, selectedColor, currentMapStyle]);

  // Clean up drag event listeners
  const cleanupDragListeners = () => {
    if (dragHandlers.current.mousemove) {
      document.removeEventListener('mousemove', dragHandlers.current.mousemove);
      dragHandlers.current.mousemove = undefined;
    }
    if (dragHandlers.current.mouseup) {
      document.removeEventListener('mouseup', dragHandlers.current.mouseup);
      dragHandlers.current.mouseup = undefined;
    }
  };

  // Force resize when component mounts or container changes
  useEffect(() => {
    if (map.current && mapInitialized) {
      const resizeTimer = setTimeout(() => {
        map.current?.resize();
      }, 100);
      
      return () => clearTimeout(resizeTimer);
    }
  }, [mapInitialized]);

  // Update draw styles when color changes
  useEffect(() => {
    if (!draw.current || !map.current || !mapInitialized) return;

    // Remove existing draw control and re-add with new styles
    map.current.removeControl(draw.current);
    
    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: drawMode,
      styles: createDrawStyles(selectedColor)
    });

    map.current.addControl(draw.current, 'top-right');
    draw.current.changeMode(drawMode);
  }, [selectedColor, mapInitialized, drawMode]);

  // Toggle map style function
  const toggleMapStyle = () => {
    if (!map.current || !mapInitialized) return;

    const newStyle = currentMapStyle === 'mapbox://styles/mapbox/satellite-streets-v12' 
      ? 'mapbox://styles/mapbox/streets-v12'
      : 'mapbox://styles/mapbox/satellite-streets-v12';
    
    setCurrentMapStyle(newStyle);
    map.current.setStyle(newStyle);
    
    const styleType = newStyle.includes('satellite') ? 'Satellite' : 'Streets';
    toast.success(`Switched to ${styleType} view`);
  };

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
      toast.info('Click on the map to start measuring. Click again to add points. Drag points to adjust lengths.');
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
    // Don't add points while dragging
    if (isDraggingMeasurePoint) return;
    
    const coords = [e.lngLat.lng, e.lngLat.lat];
    measurePoints.current.push(coords);
    
    if (measurePoints.current.length > 1) {
      const segmentDistance = calculateDistance(
        measurePoints.current[measurePoints.current.length - 2], 
        measurePoints.current[measurePoints.current.length - 1]
      );
      
      const totalDistance = measurePoints.current.reduce((total, point, index) => {
        if (index === 0) return 0;
        return total + calculateDistance(measurePoints.current[index - 1], point);
      }, 0);
      
      toast.success(`Segment: ${formatDistance(segmentDistance)} | Total: ${formatDistance(totalDistance)}`);
    }
    
    updateMeasureDisplay();
  };

  const updateMeasureDisplay = () => {
    if (!measureSource.current) return;

    const features = [];
    
    // Add points
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

    // Add line segments with distance labels
    if (measurePoints.current.length > 1) {
      for (let i = 1; i < measurePoints.current.length; i++) {
        const startPoint = measurePoints.current[i - 1];
        const endPoint = measurePoints.current[i];
        const distance = calculateDistance(startPoint, endPoint);
        const midPoint = [
          (startPoint[0] + endPoint[0]) / 2,
          (startPoint[1] + endPoint[1]) / 2
        ];

        // Add line segment
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [startPoint, endPoint]
          },
          properties: {
            segmentId: i
          }
        });

        // Add distance label at midpoint
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: midPoint
          },
          properties: {
            distance: formatDistance(distance),
            isLabel: true
          }
        });
      }
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
      // Create a permanent line feature with proper typing
      const lineFeature = {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
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
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
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
    
    if (isFreehandDrawing) {
      toggleFreehandDrawing();
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

  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
      setIsCapturingSnapshot(true);
      toast.info('Capturing map snapshot...');

      // Wait a moment for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get the map canvas and convert to base64
      const canvas = map.current.getCanvas();
      const dataURL = canvas.toDataURL('image/png');

      console.log('Map snapshot captured, saving to backend...');

      // Call edge function to save the snapshot
      const { data, error } = await supabase.functions.invoke('save-map-snapshot', {
        body: {
          bookingId: selectedBooking.id,
          bookingNumber: selectedBooking.bookingNumber,
          imageData: dataURL
        }
      });

      if (error) {
        console.error('Error saving snapshot:', error);
        toast.error('Failed to save map snapshot');
        return;
      }

      console.log('Snapshot saved successfully:', data);
      toast.success('Map snapshot saved to booking attachments');

      // Notify parent component if callback is provided
      if (onSnapshotSaved && data.attachment) {
        onSnapshotSaved(data.attachment);
      }

    } catch (error) {
      console.error('Error taking snapshot:', error);
      toast.error('Failed to capture map snapshot');
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  // Improved drag handlers for measure points
  const handleMeasurePointMouseDown = (e: mapboxgl.MapMouseEvent) => {
    if (isMeasuring) return; // Don't drag while in measuring mode
    
    e.preventDefault();
    
    const features = map.current?.queryRenderedFeatures(e.point, {
      layers: ['measure-points-layer']
    });
    
    if (features && features.length > 0) {
      const pointId = features[0].properties?.id;
      if (typeof pointId === 'number') {
        console.log('Starting drag for point:', pointId);
        setIsDraggingMeasurePoint(true);
        setDragPointIndex(pointId);
        
        if (map.current) {
          // Disable map interactions during dragging
          map.current.dragPan.disable();
          map.current.getCanvas().style.cursor = 'grabbing';
        }
        
        // Create mousemove handler
        const handleMouseMove = (mouseEvent: MouseEvent) => {
          if (!map.current || dragPointIndex === null) return;
          
          // Convert screen coordinates to map coordinates
          const rect = map.current.getContainer().getBoundingClientRect();
          const point = new mapboxgl.Point(
            mouseEvent.clientX - rect.left,
            mouseEvent.clientY - rect.top
          );
          const lngLat = map.current.unproject(point);
          const coords = [lngLat.lng, lngLat.lat];
          
          // Update the point position
          if (pointId < measurePoints.current.length) {
            measurePoints.current[pointId] = coords;
            updateMeasureDisplay();
            
            // Update toast with new distances
            if (measurePoints.current.length > 1) {
              const totalDistance = measurePoints.current.reduce((total, point, index) => {
                if (index === 0) return 0;
                return total + calculateDistance(measurePoints.current[index - 1], point);
              }, 0);
              
              // Show distance of connected segments
              let segmentInfo = '';
              if (pointId > 0) {
                const prevDistance = calculateDistance(measurePoints.current[pointId - 1], coords);
                segmentInfo += `Prev: ${formatDistance(prevDistance)}`;
              }
              if (pointId < measurePoints.current.length - 1) {
                const nextDistance = calculateDistance(coords, measurePoints.current[pointId + 1]);
                segmentInfo += segmentInfo ? ` | Next: ${formatDistance(nextDistance)}` : `Next: ${formatDistance(nextDistance)}`;
              }
              
              toast.success(`${segmentInfo} | Total: ${formatDistance(totalDistance)}`, {
                id: 'drag-update',
                duration: 1000
              });
            }
          }
        };
        
        // Create mouseup handler
        const handleMouseUp = () => {
          console.log('Ending drag for point:', pointId);
          setIsDraggingMeasurePoint(false);
          setDragPointIndex(null);
          
          if (map.current) {
            // Re-enable map interactions
            map.current.dragPan.enable();
            map.current.getCanvas().style.cursor = '';
          }
          
          // Clean up event listeners
          cleanupDragListeners();
          
          toast.success('Point position updated');
        };
        
        // Store handlers for cleanup
        dragHandlers.current.mousemove = handleMouseMove;
        dragHandlers.current.mouseup = handleMouseUp;
        
        // Add event listeners to document to catch events outside the map
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
    }
  };

  if (isLoadingToken) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100 rounded-lg">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <span className="ml-2">Loading map...</span>
      </div>
    );
  }

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-100 rounded-lg">
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
      {/* Enhanced Map Controls */}
      <MapControls
        is3DEnabled={is3DEnabled}
        toggle3D={toggle3D}
        isMeasuring={isMeasuring}
        toggleMeasuring={toggleMeasuring}
        selectedBooking={selectedBooking}
        takeMapSnapshot={takeMapSnapshot}
        isCapturingSnapshot={isCapturingSnapshot}
        resetView={resetView}
        isDrawingOpen={isDrawingOpen}
        setIsDrawingOpen={setIsDrawingOpen}
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        drawMode={drawMode}
        setDrawingMode={setDrawingMode}
        isFreehandDrawing={isFreehandDrawing}
        toggleFreehandDrawing={toggleFreehandDrawing}
        clearAllDrawings={clearAllDrawings}
        currentMapStyle={currentMapStyle}
        toggleMapStyle={toggleMapStyle}
      />

      {/* Booking Detail Panel */}
      <BookingDetailPanel
        booking={selectedBooking}
        onClose={() => onBookingSelect(null)}
      />

      {/* Map Markers */}
      <MapMarkers
        map={map}
        bookings={bookings}
        selectedBooking={selectedBooking}
        onBookingSelect={onBookingSelect}
        mapInitialized={mapInitialized}
        centerLat={centerLat}
        centerLng={centerLng}
      />

      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
};

export default MapComponent;
