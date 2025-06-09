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
import { WallSelectionDialog } from './WallSelectionDialog';
import { calculateDistance, formatDistance, createDrawStyles } from './MapUtils';

interface MapComponentProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
  centerLat?: number;
  centerLng?: number;
  onSnapshotSaved?: (attachment: any) => void;
  isFromBooking?: boolean;
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
  onSnapshotSaved,
  isFromBooking = false
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
  const [isDrawingOpen, setIsDrawingOpen] = useState(true);
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

  // Refs for dynamic event listeners
  const dragHandlers = useRef<{
    mousemove?: (e: MouseEvent) => void;
    mouseup?: (e: MouseEvent) => void;
  }>({});

  // New state for wall selection with highlighting
  const [showWallDialog, setShowWallDialog] = useState(false);
  const [pendingRectangle, setPendingRectangle] = useState<any>(null);
  const [currentSide, setCurrentSide] = useState(1);
  const [wallChoices, setWallChoices] = useState<('transparent' | 'white')[]>([]);
  const [highlightedWallId, setHighlightedWallId] = useState<string | null>(null);
  
  // New refs for wall lines sources and data
  const wallLinesSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  const [wallLinesData, setWallLinesData] = useState<any[]>([]);

  // Handle window messages for iframe resize
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'RESIZE_MAP' && map.current && mapInitialized) {
        console.log('Received resize message, resizing map...');
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

    const initialCenter: [number, number] = centerLng && centerLat 
      ? [centerLng, centerLat] 
      : [18, 60];
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
      preserveDrawingBuffer: true,
      failIfMajorPerformanceCaveat: false
    });

    console.log('🎨 Map canvas configured for capture with preserveDrawingBuffer: true');

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: createDrawStyles(selectedColor)
    });

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
    map.current.addControl(draw.current, 'top-right');

    map.current.on('load', () => {
      console.log('✅ Map loaded successfully with canvas capture enabled');
      setMapInitialized(true);
      
      map.current?.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });

      map.current?.addSource('measure-points', {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': []
        }
      });

      map.current?.addSource('freehand-lines', {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': []
        }
      });

      // Add wall lines source for colored wall lines
      map.current?.addSource('wall-lines', {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': []
        }
      });

      measureSource.current = map.current?.getSource('measure-points') as mapboxgl.GeoJSONSource;
      freehandSource.current = map.current?.getSource('freehand-lines') as mapboxgl.GeoJSONSource;
      wallLinesSource.current = map.current?.getSource('wall-lines') as mapboxgl.GeoJSONSource;

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

      map.current?.addLayer({
        'id': 'measure-labels',
        'type': 'symbol',
        'source': 'measure-points',
        'filter': ['has', 'distance'],
        'layout': {
          'text-field': ['get', 'distance'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-anchor': 'center',
          'symbol-placement': 'line',
          'text-rotation-alignment': 'map',
          'text-pitch-alignment': 'viewport'
        },
        'paint': {
          'text-color': '#ff0000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

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

      // Add wall lines layer for colored wall lines
      map.current?.addLayer({
        'id': 'wall-lines-layer',
        'type': 'line',
        'source': 'wall-lines',
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': ['get', 'color'],
          'line-width': 4
        }
      });

      // Add highlight source and layer for wall selection
      if (!map.current.getSource('wall-highlight')) {
        map.current.addSource('wall-highlight', {
          'type': 'geojson',
          'data': {
            'type': 'FeatureCollection',
            'features': []
          }
        });

        map.current.addLayer({
          'id': 'wall-highlight-layer',
          'type': 'line',
          'source': 'wall-highlight',
          'layout': {
            'line-cap': 'round',
            'line-join': 'round'
          },
          'paint': {
            'line-color': '#ff0000',
            'line-width': 6,
            'line-opacity': 0.8
          }
        });
      }

      map.current?.on('mousedown', 'measure-points-layer', handleMeasurePointMouseDown);

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

      setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 200);
    });

    setTimeout(() => {
      if (map.current) {
        map.current.resize();
      }
    }, 100);

    map.current.on('draw.create', (e: DrawEvent) => {
      const feature = e.features[0];
      console.log('Created feature:', feature);
      
      // Check if it's a polygon (rectangle)
      if (feature.geometry.type === 'Polygon') {
        console.log('Rectangle created, starting wall selection...');
        
        // Remove the feature temporarily
        if (draw.current) {
          draw.current.delete(feature.id);
        }
        
        // Store the rectangle for wall selection
        setPendingRectangle(feature);
        setCurrentSide(1);
        setWallChoices([]);
        
        // Highlight the first wall (top wall)
        const coordinates = feature.geometry.coordinates[0];
        highlightCurrentWall(coordinates, 0); // First wall (index 0)
        
        setShowWallDialog(true);
      } else {
        toast.success(`${feature.geometry.type} created`);
      }
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
      cleanupDragListeners();
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, isLoadingToken, centerLat, centerLng, currentMapStyle]);

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

  useEffect(() => {
    if (map.current && mapInitialized) {
      const resizeTimer = setTimeout(() => {
        map.current?.resize();
      }, 100);
      
      return () => clearTimeout(resizeTimer);
    }
  }, [mapInitialized]);

  useEffect(() => {
    if (!draw.current || !map.current || !mapInitialized) return;

    console.log('🎨 Updating draw styles for color:', selectedColor);
    
    try {
      const newStyles = createDrawStyles(selectedColor);
      
      const currentFeatures = draw.current.getAll();
      
      if (draw.current.options) {
        draw.current.options.styles = newStyles;
      }
      
      if (currentFeatures.features.length > 0) {
        draw.current.deleteAll();
        draw.current.add(currentFeatures);
      }
      
      console.log('✅ Draw styles updated successfully');
    } catch (error) {
      console.error('❌ Error updating draw styles:', error);
    }
  }, [selectedColor, mapInitialized]);

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
      for (let i = 1; i < measurePoints.current.length; i++) {
        const startPoint = measurePoints.current[i - 1];
        const endPoint = measurePoints.current[i];
        const distance = calculateDistance(startPoint, endPoint);

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

    if (measurePoints.current.length >= 2) {
      const lastIndex = measurePoints.current.length - 1;
      const lastDistance = calculateDistance(
        measurePoints.current[lastIndex - 1], 
        measurePoints.current[lastIndex]
      );

      const canvas = map.current?.getCanvas();
      if (canvas && map.current) {
        const rect = canvas.getBoundingClientRect();
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

  const toggleFreehandDrawing = () => {
    if (!map.current || !mapInitialized) return;

    if (!isFreehandDrawing) {
      if (draw.current) {
        draw.current.changeMode('simple_select');
        setDrawMode('simple_select');
      }
      
      if (isMeasuring) {
        toggleMeasuring();
      }
      
      setIsFreehandDrawing(true);
      map.current.getCanvas().style.cursor = 'crosshair';
      toast.info('Freehand drawing enabled. Click and drag to draw.');
      
      map.current.on('mousedown', handleFreehandStart);
      map.current.on('mousemove', handleFreehandMove);
      map.current.on('mouseup', handleFreehandEnd);
    } else {
      setIsFreehandDrawing(false);
      setIsDrawing(false);
      map.current.getCanvas().style.cursor = '';
      
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

  useEffect(() => {
    if (!map.current || !mapInitialized) return;
    
    map.current.setPaintProperty('freehand-lines-layer', 'line-color', selectedColor);
  }, [selectedColor, mapInitialized]);

  const setDrawingMode = (mode: string) => {
    if (!draw.current) return;
    
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

      const sampleSize = 20;
      const samplePoints: [number, number][] = [];
      
      for (let i = 0; i < sampleSize; i++) {
        const x = (width / sampleSize) * i + (width / (sampleSize * 2));
        const y = (height / sampleSize) * i + (height / (sampleSize * 2));
        samplePoints.push([x, y]);
        
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
      
      const hasContent = (
        nonTransparentPixels >= 5 ||
        transparencyRatio > 0.1 ||
        colorVariation > 10
      );

      console.log(`📊 Improved canvas validation result:`, {
        totalSamplePoints: samplePoints.length,
        nonTransparentPixels,
        transparencyRatio: Math.round(transparencyRatio * 100) + '%',
        colorVariation: Math.round(colorVariation),
        hasContent,
        canvasDimensions: { width, height }
      });

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
      console.log('⚠️ Validation error occurred, proceeding with snapshot anyway');
      return true;
    }
  };

  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      console.error('❌ Cannot take snapshot: missing map or booking');
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
      setIsCapturingSnapshot(true);
      console.log('📸 Starting direct map snapshot capture for booking:', selectedBooking.bookingNumber);
      
      toast.info('Capturing map snapshot...');
      
      const isMapReady = await waitForMapReady();
      
      if (!isMapReady) {
        console.warn('⚠️ Map may not be fully ready, but proceeding...');
        toast.info('Map may still be loading, but capturing anyway...');
      }

      for (let i = 0; i < 3; i++) {
        map.current.resize();
        map.current.triggerRepaint();
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      const canvas = map.current.getCanvas();
      console.log('📏 Canvas dimensions:', {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight
      });

      const hasValidContent = validateCanvasContent(canvas);
      
      if (!hasValidContent) {
        console.warn('⚠️ Canvas validation suggests empty content, but proceeding anyway');
        toast.info('Canvas appears empty but attempting capture...');
      } else {
        console.log('✅ Canvas validation passed - content detected');
        toast.info('Canvas content validated, capturing...');
      }

      let dataURL = '';
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`📸 Step 5: Canvas capture attempt ${attempts}/${maxAttempts}...`);
        
        try {
          map.current.triggerRepaint();
          await new Promise(resolve => setTimeout(resolve, 500));
          
          dataURL = canvas.toDataURL('image/png', 1.0);
          
          if (dataURL && dataURL.length > 100) {
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

      if (!dataURL || dataURL.length < 50) {
        console.error('❌ Failed to capture any canvas data after all attempts');
        toast.error('Failed to capture map image - no data available');
        return;
      }

      console.log('🖼️ Captured image data preview:', dataURL.substring(0, 100) + '...');
      console.log('📏 Captured image size:', Math.round(dataURL.length / 1024), 'KB');

      console.log('☁️ Step 7: Uploading snapshot directly to server...');
      toast.info('Saving map snapshot...');
      
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
        return;
      }

      console.log('✅ Snapshot saved successfully:', {
        hasUrl: !!data?.url,
        hasAttachment: !!data?.attachment,
        url: data?.url
      });

      toast.success('Map snapshot saved successfully!');
      
      if (onSnapshotSaved && data.attachment) {
        console.log('📋 Notifying parent component of snapshot save');
        onSnapshotSaved(data.attachment);
      }

    } catch (error) {
      console.error('💥 Fatal error taking snapshot:', error);
      toast.error('Failed to capture map snapshot');
    } finally {
      setIsCapturingSnapshot(false);
      console.log('🏁 Direct snapshot capture process completed');
    }
  };

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

        const isStyleLoaded = map.current.isStyleLoaded();
        console.log('🎨 Style loaded:', isStyleLoaded);

        const isMapIdle = map.current.loaded();
        console.log('⏸️ Map idle/loaded:', isMapIdle);

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

  const handleMeasurePointMouseDown = (e: mapboxgl.MapMouseEvent) => {
    if (isMeasuring) return;
    
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
          map.current.dragPan.disable();
          map.current.getCanvas().style.cursor = 'grabbing';
        }
        
        const handleMouseMove = (mouseEvent: MouseEvent) => {
          if (!map.current || dragPointIndex === null) return;
          
          const rect = map.current.getContainer().getBoundingClientRect();
          const point = new mapboxgl.Point(
            mouseEvent.clientX - rect.left,
            mouseEvent.clientY - rect.top
          );
          const lngLat = map.current.unproject(point);
          const coords = [lngLat.lng, lngLat.lat];
          
          if (pointId < measurePoints.current.length) {
            measurePoints.current[pointId] = coords;
            updateMeasureDisplay();
            
            let liveMeasurementText = '';
            
            if (measurePoints.current.length > 1) {
              const totalDistance = measurePoints.current.reduce((total, point, index) => {
                if (index === 0) return 0;
                return total + calculateDistance(measurePoints.current[index - 1], point);
              }, 0);
              
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
            
            setLiveMeasurement({
              distance: liveMeasurementText,
              x: mouseEvent.clientX,
              y: mouseEvent.clientY - 30,
              visible: true
            });
          }
        };
        
        const handleMouseUp = () => {
          console.log('Ending drag for point:', pointId);
          setIsDraggingMeasurePoint(false);
          setDragPointIndex(null);
          
          setLiveMeasurement(prev => ({ ...prev, visible: false }));
          
          if (map.current) {
            map.current.dragPan.enable();
            map.current.getCanvas().style.cursor = '';
          }
          
          cleanupDragListeners();
          
          toast.success('Point position updated');
        };
        
        dragHandlers.current.mousemove = handleMouseMove;
        dragHandlers.current.mouseup = handleMouseUp;
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
    }
  };

  const highlightCurrentWall = (rectangleCoords: number[][], sideIndex: number) => {
    if (!map.current || !map.current.getSource('wall-highlight')) return;

    const startPoint = rectangleCoords[sideIndex];
    const endPoint = rectangleCoords[sideIndex + 1] || rectangleCoords[0];

    const highlightFeature = {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [startPoint, endPoint]
      },
      properties: {}
    };

    const source = map.current.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
    source.setData({
      type: 'FeatureCollection',
      features: [highlightFeature]
    });
  };

  const clearWallHighlight = () => {
    if (!map.current || !map.current.getSource('wall-highlight')) return;

    const source = map.current.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
    source.setData({
      type: 'FeatureCollection',
      features: []
    });
  };

  const handleWallChoice = (choice: 'transparent' | 'white') => {
    const newChoices = [...wallChoices, choice];
    setWallChoices(newChoices);
    
    // Create the wall line as a proper map layer feature with correct color
    if (pendingRectangle && wallLinesSource.current) {
      const coordinates = pendingRectangle.geometry.coordinates[0];
      const currentIndex = currentSide - 1; // Convert to 0-based index
      const startPoint = coordinates[currentIndex];
      const endPoint = coordinates[currentIndex + 1] || coordinates[0];
      
      const lineColor = choice === 'transparent' ? '#3b82f6' : '#000000';
      
      // Get existing wall lines
      const existingData = wallLinesSource.current._data || {
        type: 'FeatureCollection',
        features: []
      };
      
      const newLineFeature = {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [startPoint, endPoint]
        },
        properties: {
          color: lineColor,
          wallType: choice,
          id: Date.now() + currentIndex
        }
      };
      
      // Add the new line to existing features
      const updatedFeatures = [...existingData.features, newLineFeature];
      
      // Update the wall lines source
      wallLinesSource.current.setData({
        type: 'FeatureCollection',
        features: updatedFeatures
      });
      
      // Update the wall lines data state
      const updatedWallLines = [...wallLinesData, newLineFeature];
      setWallLinesData(updatedWallLines);
      
      console.log(`Added ${choice} wall line with color ${lineColor}`);
    }
    
    if (currentSide < 4) {
      const nextSide = currentSide + 1;
      setCurrentSide(nextSide);
      
      // Highlight the next wall
      if (pendingRectangle) {
        const coordinates = pendingRectangle.geometry.coordinates[0];
        highlightCurrentWall(coordinates, nextSide - 1); // Convert to 0-based index
      }
    } else {
      // All sides chosen - just clean up and hide dialog
      setShowWallDialog(false);
      clearWallHighlight();
      
      // Clear the pending rectangle - we don't need it anymore since we have the individual wall lines
      setPendingRectangle(null);
      setCurrentSide(1);
      setWallChoices([]);
      
      toast.success('Rectangle with wall choices completed!');
    }
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden relative">
      {/* Live Measurement Display */}
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

      {/* Wall Selection Dialog */}
      <WallSelectionDialog
        open={showWallDialog}
        currentSide={currentSide}
        totalSides={4}
        onTransparentChoice={() => handleWallChoice('transparent')}
        onWhiteChoice={() => handleWallChoice('white')}
      />

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
        isFromBooking={isFromBooking}
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
