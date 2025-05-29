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
import { SnapshotPreviewModal } from './SnapshotPreviewModal';

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
  const [isDrawingOpen, setIsDrawingOpen] = useState(true); // Changed to true by default
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
  
  // Fixed live measurement state
  const [liveMeasurement, setLiveMeasurement] = useState<{
    distance: string;
    x: number;
    y: number;
    visible: boolean;
  }>({ distance: '', x: 0, y: 0, visible: false });

  // Fixed states for snapshot preview modal
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [snapshotImageUrl, setSnapshotImageUrl] = useState<string>('');

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

    console.log('🗺️ Initializing map with WebGL canvas capture enabled...');

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: currentMapStyle,
      center: initialCenter,
      zoom: initialZoom,
      maxZoom: 22,
      minZoom: 1,
      pitch: 0,
      bearing: 0,
      antialias: true,
      projection: 'globe',
      // CRITICAL: Enable canvas capture for WebGL
      preserveDrawingBuffer: true,
      // Additional WebGL options for better capture
      failIfMajorPerformanceCaveat: false
    });

    console.log('🎨 Map canvas configured for capture with preserveDrawingBuffer: true');

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
      console.log('✅ Map loaded successfully with canvas capture enabled');
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

      // Add measuring layers with improved styling
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

      // Enhanced layer for distance labels positioned ON the lines
      map.current?.addLayer({
        'id': 'measure-labels',
        'type': 'symbol',
        'source': 'measure-points',
        'filter': ['has', 'distance'], // Only show labels for line segments, not points
        'layout': {
          'text-field': ['get', 'distance'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center',
          'symbol-placement': 'line', // Place labels along the line
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'viewport'
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
  }, [mapboxToken, isLoadingToken, centerLat, centerLng, currentMapStyle]);

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

  // FIXED: Update draw styles when color changes without removing/re-adding control
  useEffect(() => {
    if (!draw.current || !map.current || !mapInitialized) return;

    console.log('🎨 Updating draw styles for color:', selectedColor);
    
    try {
      // Update the draw control's styles directly without removing it
      const newStyles = createDrawStyles(selectedColor);
      
      // Clear existing drawings to apply new color
      const currentFeatures = draw.current.getAll();
      
      // Update the internal styles of the draw control
      if (draw.current.options) {
        draw.current.options.styles = newStyles;
      }
      
      // Force a refresh of the draw control's rendering
      if (currentFeatures.features.length > 0) {
        // Re-add features to apply new styles
        draw.current.deleteAll();
        draw.current.add(currentFeatures);
      }
      
      console.log('✅ Draw styles updated successfully');
    } catch (error) {
      console.error('❌ Error updating draw styles:', error);
    }
  }, [selectedColor, mapInitialized]);

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
    
    // Add points (keeping the draggable points)
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

    // Add line segments with distance labels positioned ON the lines (no midpoint dots)
    if (measurePoints.current.length > 1) {
      for (let i = 1; i < measurePoints.current.length; i++) {
        const startPoint = measurePoints.current[i - 1];
        const endPoint = measurePoints.current[i];
        const distance = calculateDistance(startPoint, endPoint);

        // Add line segment
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [startPoint, endPoint]
          },
          properties: {
            segmentId: i,
            distance: formatDistance(distance)
          }
        });
      }
    }

    // Add real-time measurement display when there are 2 or more points
    if (measurePoints.current.length >= 2) {
      const lastIndex = measurePoints.current.length - 1;
      const lastDistance = calculateDistance(
        measurePoints.current[lastIndex - 1], 
        measurePoints.current[lastIndex]
      );

      const canvas = map.current?.getCanvas();
      if (canvas && map.current) {
        const rect = canvas.getBoundingClientRect();
        // Fix: properly type the coordinates as [number, number]
        const lastPoint = measurePoints.current[lastIndex];
        const midpoint = map.current.project([lastPoint[0], lastPoint[1]] as [number, number]);

        setLiveMeasurement({
          visible: true,
          distance: formatDistance(lastDistance),
          x: midpoint.x + rect.left,
          y: midpoint.y + rect.top - 30
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

  // Validate canvas data
  const validateCanvasContent = (canvas: HTMLCanvasElement): boolean => {
    console.log('🔍 Validating canvas content with improved logic...');
    
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('❌ Cannot get 2D context from canvas');
        return false;
      }

      const width = canvas.width;
      const height = canvas.height;
      
      console.log('📏 Canvas dimensions:', { width, height });

      // Sample more points across the canvas for better coverage
      const sampleSize = 20;
      const samplePoints: [number, number][] = [];
      
      // Create a grid of sample points
      for (let i = 0; i < sampleSize; i++) {
        const x = (width / sampleSize) * i + (width / (sampleSize * 2));
        const y = (height / sampleSize) * i + (height / (sampleSize * 2));
        samplePoints.push([x, y]);
        
        // Add some diagonal samples
        const diagX = (width / sampleSize) * i;
        const diagY = (height / sampleSize) * (sampleSize - 1 - i);
        samplePoints.push([diagX, diagY]);
      }

      let nonTransparentPixels = 0;
      let colorVariation = 0;
      const colors: number[][] = [];

      for (const [x, y] of samplePoints) {
        const imageData = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);
        const [r, g, b, a] = imageData.data;
        
        if (a > 0) {
          nonTransparentPixels++;
          colors.push([r, g, b]);
        }
      }

      // Calculate color variation to detect if there's actual map content
      if (colors.length > 1) {
        for (let i = 1; i < colors.length; i++) {
          const [r1, g1, b1] = colors[i - 1];
          const [r2, g2, b2] = colors[i];
          const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
          colorVariation += diff;
        }
        colorVariation = colorVariation / colors.length;
      }

      const transparencyRatio = nonTransparentPixels / samplePoints.length;
      
      // Much more lenient validation criteria
      const hasContent = (
        nonTransparentPixels >= 5 || // At least 5 non-transparent pixels
        transparencyRatio > 0.1 ||   // Or 10% non-transparent
        colorVariation > 10          // Or some color variation indicating content
      );

      console.log(`📊 Improved canvas validation result:`, {
        totalSamplePoints: samplePoints.length,
        nonTransparentPixels,
        transparencyRatio: Math.round(transparencyRatio * 100) + '%',
        colorVariation: Math.round(colorVariation),
        hasContent,
        canvasDimensions: { width, height }
      });

      // If validation still fails, log a sample of pixel data for debugging
      if (!hasContent) {
        console.log('🔍 Detailed pixel analysis (first 10 samples):');
        for (let i = 0; i < Math.min(10, samplePoints.length); i++) {
          const [x, y] = samplePoints[i];
          const imageData = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);
          const [r, g, b, a] = imageData.data;
          console.log(`  Point ${i}: (${Math.floor(x)}, ${Math.floor(y)}) = rgba(${r}, ${g}, ${b}, ${a})`);
        }
      }

      return hasContent;
    } catch (error) {
      console.error('❌ Error validating canvas content:', error);
      // If validation fails, assume the canvas has content and proceed
      console.log('⚠️ Validation error occurred, proceeding with snapshot anyway');
      return true;
    }
  };

  // Enhanced takeMapSnapshot function with improved validation
  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      console.error('❌ Cannot take snapshot: missing map or booking');
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
      setIsCapturingSnapshot(true);
      console.log('📸 Starting enhanced map snapshot capture for booking:', selectedBooking.bookingNumber);
      
      // Show modal immediately with loading state
      setSnapshotImageUrl('');
      setShowSnapshotModal(true);
      console.log('👁️ Snapshot modal opened in loading state');
      
      toast.info('Preparing map for snapshot...');
      
      // Step 1: Wait for map to be fully ready
      console.log('⏳ Step 1: Waiting for map to be fully ready...');
      const isMapReady = await waitForMapReady();
      
      if (!isMapReady) {
        console.warn('⚠️ Map may not be fully ready, but proceeding...');
        toast.info('Map may still be loading, but capturing anyway...');
      }

      // Step 2: Force multiple render cycles to ensure WebGL buffer is updated
      console.log('🔄 Step 2: Forcing map render cycles...');
      for (let i = 0; i < 3; i++) {
        map.current.resize();
        map.current.triggerRepaint();
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Step 3: Get and validate canvas
      console.log('🎨 Step 3: Getting map canvas...');
      const canvas = map.current.getCanvas();
      console.log('📏 Canvas dimensions:', {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight
      });

      // Step 4: Validate canvas with improved logic
      console.log('🔍 Step 4: Validating canvas content...');
      const hasValidContent = validateCanvasContent(canvas);
      
      if (!hasValidContent) {
        console.warn('⚠️ Canvas validation suggests empty content, but proceeding anyway');
        toast.info('Canvas appears empty but attempting capture...');
      } else {
        console.log('✅ Canvas validation passed - content detected');
        toast.info('Canvas content validated, capturing...');
      }

      // Step 5: Capture with multiple attempts and improved error handling
      let dataURL = '';
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`📸 Step 5: Canvas capture attempt ${attempts}/${maxAttempts}...`);
        
        try {
          // Force another render before capture
          map.current.triggerRepaint();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          dataURL = canvas.toDataURL('image/png', 1.0); // Maximum quality
          
          // More lenient data validation
          if (dataURL && dataURL.length > 100) { // Just check if we got some data
            console.log('✅ Canvas capture successful on attempt', attempts);
            break;
          } else {
            console.warn(`⚠️ Captured data seems too small on attempt ${attempts}:`, {
              dataURLLength: dataURL.length,
              preview: dataURL.substring(0, 50) + '...'
            });
            if (attempts < maxAttempts) {
              console.log('⏳ Waiting 1 second before retry...');
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (error) {
          console.error(`❌ Canvas capture error on attempt ${attempts}:`, error);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // Proceed even with small data - let the server handle it
      if (!dataURL || dataURL.length < 50) {
        console.error('❌ Failed to capture any canvas data after all attempts');
        toast.error('Failed to capture map image - no data available');
        setShowSnapshotModal(false);
        return;
      }

      // Step 6: Debug info about captured data
      console.log('🖼️ Captured image data preview:', dataURL.substring(0, 100) + '...');
      console.log('📏 Captured image size:', Math.round(dataURL.length / 1024), 'KB');

      console.log('☁️ Step 7: Uploading snapshot to server...');
      toast.info('Uploading map snapshot...');
      
      // Upload to the save-map-snapshot endpoint
      const { data, error } = await supabase.functions.invoke('save-map-snapshot', {
        body: {
          image: dataURL,
          bookingId: selectedBooking.id,
          bookingNumber: selectedBooking.bookingNumber
        }
      });

      if (error) {
        console.error('❌ Error saving snapshot:', error);
        toast.error('Failed to save map snapshot');
        setShowSnapshotModal(false);
        return;
      }

      console.log('✅ Snapshot uploaded successfully:', {
        hasUrl: !!data?.url,
        hasAttachment: !!data?.attachment,
        url: data?.url
      });

      // Step 8: Set the snapshot URL to display in modal
      if (data?.url) {
        console.log('🖼️ Setting snapshot URL for display:', data.url);
        setSnapshotImageUrl(data.url);
        toast.success('Map snapshot captured successfully');
        
        // Notify parent component if callback is provided
        if (onSnapshotSaved && data.attachment) {
          console.log('📋 Notifying parent component of snapshot save');
          onSnapshotSaved(data.attachment);
        }
      } else {
        console.error('❌ No URL returned from server');
        toast.error('Failed to get snapshot URL');
        setShowSnapshotModal(false);
      }

    } catch (error) {
      console.error('💥 Fatal error taking snapshot:', error);
      toast.error('Failed to capture map snapshot');
      setShowSnapshotModal(false);
    } finally {
      setIsCapturingSnapshot(false);
      console.log('🏁 Enhanced snapshot capture process completed');
    }
  };

  // NEW: Save original snapshot handler
  const handleSaveOriginalSnapshot = async (imageData: string) => {
    if (!selectedBooking) {
      toast.error('No booking selected');
      return;
    }

    try {
      console.log('💾 Saving original snapshot for booking:', selectedBooking.bookingNumber);
      toast.info('Saving snapshot...');

      const { data, error } = await supabase.functions.invoke('save-map-snapshot', {
        body: {
          image: imageData,
          bookingId: selectedBooking.id,
          bookingNumber: selectedBooking.bookingNumber
        }
      });

      if (error) {
        console.error('❌ Error saving original snapshot:', error);
        toast.error('Failed to save snapshot');
        return;
      }

      console.log('✅ Original snapshot saved successfully');
      toast.success('Snapshot saved successfully');
      
      // Notify parent component if callback is provided
      if (onSnapshotSaved && data?.attachment) {
        console.log('📋 Notifying parent component of original snapshot save');
        onSnapshotSaved(data.attachment);
      }

      // Close modal after successful save
      closeSnapshotModal();
    } catch (error) {
      console.error('💥 Fatal error saving original snapshot:', error);
      toast.error('Failed to save snapshot');
    }
  };

  // Improved map readiness check function
  const waitForMapReady = async (): Promise<boolean> => {
    if (!map.current) return false;

    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;
      const checkInterval = 500;

      const checkMapReady = () => {
        attempts++;
        console.log(`🔍 Map readiness check attempt ${attempts}/${maxAttempts}`);
        
        if (!map.current) {
          console.log('❌ Map instance not available');
          resolve(false);
          return;
        }

        // Check if map style is loaded
        const isStyleLoaded = map.current.isStyleLoaded();
        console.log('🎨 Style loaded:', isStyleLoaded);

        // Check if map is idle (all sources loaded)
        const isMapIdle = map.current.loaded();
        console.log('⏸️ Map idle/loaded:', isMapIdle);

        // Get canvas dimensions
        const canvas = map.current.getCanvas();
        const canvasValid = canvas && canvas.width > 0 && canvas.height > 0;
        console.log('🖼️ Canvas valid:', canvasValid, {
          width: canvas?.width || 0,
          height: canvas?.height || 0
        });

        if (isStyleLoaded && isMapIdle && canvasValid) {
          console.log('✅ Map is fully ready for snapshot');
          resolve(true);
          return;
        }

        if (attempts >= maxAttempts) {
          console.log('⚠️ Max attempts reached, proceeding anyway');
          resolve(false);
          return;
        }

        setTimeout(checkMapReady, checkInterval);
      };

      checkMapReady();
    });
  };

  // Validate canvas data
  const validateCanvasData = (canvas: HTMLCanvasElement, dataURL: string): boolean => {
    console.log('🔍 Validating canvas data...');
    
    // Check canvas dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      console.error('❌ Canvas has zero dimensions:', {
        width: canvas.width,
        height: canvas.height
      });
      return false;
    }

    // Check data URL length (empty canvas produces very small base64)
    if (dataURL.length < 1000) {
      console.error('❌ Data URL too short, likely empty canvas:', {
        length: dataURL.length,
        preview: dataURL.substring(0, 100)
      });
      return false;
    }

    // Calculate approximate file size
    const base64Length = dataURL.split(',')[1]?.length || 0;
    const fileSizeKB = Math.round((base64Length * 3/4) / 1024);
    
    console.log('📊 Canvas validation passed:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      dataURLLength: dataURL.length,
      estimatedSizeKB: fileSizeKB
    });

    return fileSizeKB > 1; // Must be at least 1KB
  };

  // Function to close snapshot modal
  const closeSnapshotModal = () => {
    console.log('🚪 Closing snapshot modal and clearing state');
    setShowSnapshotModal(false);
    setSnapshotImageUrl('');
  };

  // FIXED: Enhanced drag handlers with real-time measurement display
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
        
        // FIXED: Create enhanced mousemove handler with live measurement
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
            
            // FIXED: Calculate and display live measurements
            let liveMeasurementText = '';
            
            if (measurePoints.current.length > 1) {
              const totalDistance = measurePoints.current.reduce((total, point, index) => {
                if (index === 0) return 0;
                return total + calculateDistance(measurePoints.current[index - 1], point);
              }, 0);
              
              // Show distance of connected segments
              let segmentInfo = '';
              if (pointId > 0) {
                const prevDistance = calculateDistance(measurePoints.current[pointId - 1], coords);
                segmentInfo += `${formatDistance(prevDistance)}`;
              }
              if (pointId < measurePoints.current.length - 1) {
                const nextDistance = calculateDistance(coords, measurePoints.current[pointId + 1]);
                segmentInfo += segmentInfo ? ` | ${formatDistance(nextDistance)}` : `${formatDistance(nextDistance)}`;
              }
              
              liveMeasurementText = `${segmentInfo} | Total: ${formatDistance(totalDistance)}`;
            }
            
            // FIXED: Update live measurement display with proper state update
            setLiveMeasurement({
              distance: liveMeasurementText,
              x: mouseEvent.clientX,
              y: mouseEvent.clientY - 30, // Offset above cursor
              visible: true
            });
          }
        };
        
        // Create mouseup handler
        const handleMouseUp = () => {
          console.log('Ending drag for point:', pointId);
          setIsDraggingMeasurePoint(false);
          setDragPointIndex(null);
          
          // Hide live measurement
          setLiveMeasurement(prev => ({ ...prev, visible: false }));
          
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
      {/* FIXED: Live Measurement Display with better positioning */}
      {liveMeasurement.visible && (
        <div 
          className="fixed z-50 bg-black/90 text-white px-3 py-2 rounded-lg text-sm pointer-events-none shadow-lg border border-white/20"
          style={{
            left: liveMeasurement.x,
            top: liveMeasurement.y,
            transform: 'translateX(-50%)',
            fontSize: '13px',
            fontWeight: '500'
          }}
        >
          {liveMeasurement.distance}
        </div>
      )}

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

      {/* FIXED: Enhanced Snapshot Preview Modal with working save handler */}
      <SnapshotPreviewModal
        isOpen={showSnapshotModal}
        onClose={closeSnapshotModal}
        imageData={snapshotImageUrl}
        onSave={handleSaveOriginalSnapshot}
        bookingNumber={selectedBooking?.bookingNumber}
      />

      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
};

export default MapComponent;
