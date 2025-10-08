import React, { useRef, useEffect } from 'react';
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
import { createDrawStyles, calculateDistance, formatDistance } from './MapUtils';
import { useMapState } from './hooks/useMapState';
import { useMeasurement } from './hooks/useMeasurement';
import { useWallSelection } from './hooks/useWallSelection';
import { useFreehandDrawing } from './hooks/useFreehandDrawing';
import { useMapEventHandlers } from './hooks/useMapEventHandlers';
import { useMapSnapshot } from './hooks/useMapSnapshot';

interface MapComponentProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
  centerLat?: number;
  centerLng?: number;
  onSnapshotSaved?: (attachment: any) => void;
  isFromBooking?: boolean;
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
  const {
    mapContainer,
    map,
    draw,
    mapInitialized,
    setMapInitialized,
    mapboxToken,
    setMapboxToken,
    isLoadingToken,
    setIsLoadingToken,
    is3DEnabled,
    setIs3DEnabled,
    drawMode,
    setDrawMode,
    selectedColor,
    setSelectedColor,
    isDrawingOpen,
    setIsDrawingOpen,
    currentMapStyle,
    setCurrentMapStyle,
    isCapturingSnapshot,
    setIsCapturingSnapshot
  } = useMapState();

  const {
    isMeasuring,
    setIsMeasuring,
    isDraggingMeasurePoint,
    setIsDraggingMeasurePoint,
    dragPointIndex,
    setDragPointIndex,
    measurePoints,
    measureSource,
    liveMeasurement,
    setLiveMeasurement,
    dragHandlers,
    cleanupDragListeners,
    updateMeasureDisplay,
    handleMeasureClick,
    toggleMeasuring
  } = useMeasurement(map);

  const {
    showWallDialog,
    setShowWallDialog,
    pendingLine,
    setPendingLine,
    pendingFeatureId,
    setPendingFeatureId,
    currentSegment,
    setCurrentSegment,
    wallChoices,
    setWallChoices,
    highlightedWallId,
    setHighlightedWallId,
    wallLinesSource,
    wallLinesData,
    setWallLinesData,
    selectedWallLineId,
    setSelectedWallLineId,
    isDraggingWallLine,
    setIsDraggingWallLine,
    dragWallLineIndex,
    setDragWallLineIndex,
    dragWallPointIndex,
    setDragWallPointIndex,
    segmentDistance,
    getTotalSegments,
    highlightCurrentWall,
    clearWallHighlight,
    handleWallChoice,
    cancelWallSelection,
    deleteSelectedWallLine
  } = useWallSelection();

  const {
    isFreehandDrawing,
    setIsFreehandDrawing,
    freehandPoints,
    setFreehandPoints,
    isDrawing,
    setIsDrawing,
    freehandSource,
    updateFreehandDisplay,
    handleFreehandStart,
    handleFreehandMove,
    handleFreehandEnd,
    toggleFreehandDrawing
  } = useFreehandDrawing(map, draw, selectedColor);

  const { takeMapSnapshot } = useMapSnapshot(map, selectedBooking, onSnapshotSaved);

  // Create wrapper functions that match the expected signatures
  const clearWallHighlightWrapper = () => {
    if (map.current) {
      // clearWallHighlight expects (map, setSegmentDistance) - we need to provide a dummy function
      clearWallHighlight(map.current, () => {});
    }
  };

  const deleteSelectedWallLineWrapper = () => {
    if (map.current) {
      deleteSelectedWallLine(map.current);
    }
  };

  // Handle window messages for iframe resize
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'RESIZE_MAP' && map.current && mapInitialized) {
        setTimeout(() => {
          if (map.current) {
            map.current.resize();
          }
        }, 100);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [mapInitialized]);

  // Fetch Mapbox token
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        setIsLoadingToken(true);
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        
        if (error) {
          toast.error('Failed to load map: Could not get access token');
          return;
        }
        
        setMapboxToken(data.token);
        mapboxgl.accessToken = data.token;
      } catch (error) {
        toast.error('Failed to load map');
      } finally {
        setIsLoadingToken(false);
      }
    };

    fetchMapboxToken();
  }, []);

  // Handle measure point dragging
  const handleMeasurePointMouseDown = (e: mapboxgl.MapMouseEvent) => {
    if (isMeasuring) return;
    
    e.preventDefault();
    
    const features = map.current?.queryRenderedFeatures(e.point, {
      layers: ['measure-points-layer']
    });
    
    if (features && features.length > 0) {
      const pointId = features[0].properties?.id;
      if (typeof pointId === 'number') {
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
          }
        };
        
        const handleMouseUp = () => {
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

  // Handle wall line click
  const handleWallLineClick = (e: mapboxgl.MapMouseEvent) => {
    const features = e.features;
    if (features && features.length > 0) {
      const wallLineId = features[0].properties?.id;
      if (wallLineId) {
        setSelectedWallLineId(wallLineId);
        updateWallLinePointsDisplay(wallLineId);
        toast.info('Wall line selected. Drag the end points to edit or press Delete to remove.');
      }
    }
  };

  // Handle wall point dragging
  const handleWallPointMouseDown = (e: mapboxgl.MapMouseEvent) => {
    e.preventDefault();
    
    const features = map.current?.queryRenderedFeatures(e.point, {
      layers: ['wall-line-points']
    });
    
    if (features && features.length > 0) {
      const wallLineId = features[0].properties?.id;
      const pointIndex = features[0].properties?.pointIndex;
      
      if (typeof wallLineId === 'string' && typeof pointIndex === 'number') {
        setIsDraggingWallLine(true);
        setDragWallLineIndex(wallLinesData.findIndex(line => line.properties.id === wallLineId));
        setDragWallPointIndex(pointIndex);
        
        if (map.current) {
          map.current.dragPan.disable();
          map.current.getCanvas().style.cursor = 'grabbing';
        }
        
        const handleMouseMove = (mouseEvent: MouseEvent) => {
          if (!map.current || dragWallLineIndex === null || dragWallPointIndex === null) return;
          
          const rect = map.current.getContainer().getBoundingClientRect();
          const point = new mapboxgl.Point(
            mouseEvent.clientX - rect.left,
            mouseEvent.clientY - rect.top
          );
          const lngLat = map.current.unproject(point);
          const coords = [lngLat.lng, lngLat.lat];
          
          const updatedWallLines = [...wallLinesData];
          if (updatedWallLines[dragWallLineIndex]) {
            updatedWallLines[dragWallLineIndex].geometry.coordinates[dragWallPointIndex] = coords;
            setWallLinesData(updatedWallLines);
            
            wallLinesSource.current?.setData({
              type: 'FeatureCollection',
              features: updatedWallLines
            });
            
            updateWallLinePointsDisplay(wallLineId);
          }
        };
        
        const handleMouseUp = () => {
          setIsDraggingWallLine(false);
          setDragWallLineIndex(null);
          setDragWallPointIndex(null);
          
          if (map.current) {
            map.current.dragPan.enable();
            map.current.getCanvas().style.cursor = '';
          }
          
          cleanupDragListeners();
          toast.success('Wall line updated');
        };
        
        dragHandlers.current.mousemove = handleMouseMove;
        dragHandlers.current.mouseup = handleMouseUp;
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      }
    }
  };

  const updateWallLinePointsDisplay = (wallLineId: string) => {
    if (!wallLinesSource.current) return;

    const wallLine = wallLinesData.find(line => line.properties.id === wallLineId);
    if (!wallLine) return;

    const coordinates = wallLine.geometry.coordinates;
    const pointFeatures = coordinates.map((coord: number[], index: number) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: coord
      },
      properties: {
        id: wallLineId,
        pointIndex: index
      }
    }));

    wallLinesSource.current.setData({
      type: 'FeatureCollection',
      features: [...wallLinesData, ...pointFeatures]
    });
  };

  // Use the event handlers hook with correct number of arguments (14)
  useMapEventHandlers(
    map,
    draw,
    mapInitialized,
    setPendingLine,
    setCurrentSegment,
    setWallChoices,
    setShowWallDialog,
    highlightCurrentWall,
    handleMeasurePointMouseDown,
    handleWallLineClick,
    handleWallPointMouseDown,
    selectedWallLineId,
    deleteSelectedWallLineWrapper,
    setPendingFeatureId
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken || isLoadingToken) return;

    const initialCenter: [number, number] = centerLng && centerLat 
      ? [centerLng, centerLat] 
      : [18, 60];
    const initialZoom = centerLng && centerLat ? 12 : 4;

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
      setMapInitialized(true);
      
      // Add terrain source
      map.current?.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });

      // Add sources
      map.current?.addSource('measure-points', {
        'type': 'geojson',
        'data': { 'type': 'FeatureCollection', 'features': [] }
      });

      map.current?.addSource('freehand-lines', {
        'type': 'geojson',
        'data': { 'type': 'FeatureCollection', 'features': [] }
      });

      map.current?.addSource('wall-lines', {
        'type': 'geojson',
        'data': { 'type': 'FeatureCollection', 'features': [] }
      });

      map.current?.addSource('wall-distance-labels', {
        'type': 'geojson',
        'data': { 'type': 'FeatureCollection', 'features': [] }
      });

      map.current?.addSource('wall-highlight', {
        'type': 'geojson',
        'data': { 'type': 'FeatureCollection', 'features': [] }
      });

      map.current?.addSource('segment-numbers', {
        'type': 'geojson',
        'data': { 'type': 'FeatureCollection', 'features': [] }
      });

      measureSource.current = map.current?.getSource('measure-points') as mapboxgl.GeoJSONSource;
      freehandSource.current = map.current?.getSource('freehand-lines') as mapboxgl.GeoJSONSource;
      wallLinesSource.current = map.current?.getSource('wall-lines') as mapboxgl.GeoJSONSource;

      // Add layers in proper order (background layers first, then highlights on top)
      map.current?.addLayer({
        'id': 'measure-lines',
        'type': 'line',
        'source': 'measure-points',
        'layout': { 'line-cap': 'round', 'line-join': 'round' },
        'paint': { 'line-color': '#ff0000', 'line-width': 3 }
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
        'layout': { 'line-cap': 'round', 'line-join': 'round' },
        'paint': { 'line-color': selectedColor, 'line-width': 3 }
      });

      map.current?.addLayer({
        'id': 'wall-lines-layer',
        'type': 'line',
        'source': 'wall-lines',
        'layout': { 'line-cap': 'round', 'line-join': 'round' },
        'paint': {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['==', ['get', 'id'], selectedWallLineId || ''],
            6,
            4
          ],
          'line-opacity': [
            'case',
            ['==', ['get', 'id'], selectedWallLineId || ''],
            1.0,
            0.8
          ]
        }
      });

      map.current?.addLayer({
        'id': 'wall-line-points',
        'type': 'circle',
        'source': 'wall-lines',
        'filter': ['==', ['get', 'id'], selectedWallLineId || ''],
        'paint': {
          'circle-radius': 6,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#333333',
          'circle-stroke-width': 2
        }
      });

      // Add wall distance labels layer
      map.current?.addLayer({
        'id': 'wall-distance-labels',
        'type': 'symbol',
        'source': 'wall-distance-labels',
        'layout': {
          'text-field': ['get', 'distance'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 14,
          'text-anchor': 'center'
        },
        'paint': {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

      // CRITICAL: PINK HIGHLIGHT LAYER - ALWAYS ON TOP!
      map.current?.addLayer({
        'id': 'wall-highlight-layer',
        'type': 'line',
        'source': 'wall-highlight',
        'layout': { 'line-cap': 'round', 'line-join': 'round' },
        'paint': {
          'line-color': '#FF1493', // Bright deep pink - very visible
          'line-width': 16, // VERY THICK for maximum visibility
          'line-opacity': 1.0, // Full opacity
          'line-blur': 0 // No blur for crisp visibility
        }
      });

      // Arrow pointing to current wall - also on top
      map.current?.addLayer({
        'id': 'wall-arrow-layer',
        'type': 'symbol',
        'source': 'segment-numbers',
        'layout': {
          'text-field': '▼', // Use downward arrow that will be rotated
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 28, // Bigger arrow
          'text-anchor': 'center',
          'text-rotate': ['get', 'rotation'], // Use the rotation from properties
          'text-rotation-alignment': 'map'
        },
        'paint': {
          'text-color': '#FF1493',
          'text-halo-color': '#ffffff',
          'text-halo-width': 4 // Thicker halo
        }
      });

      // Add event listeners for mouse interactions
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

      map.current?.on('mouseenter', 'wall-lines-layer', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });

      map.current?.on('mouseleave', 'wall-lines-layer', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = '';
        }
      });

      map.current?.on('mouseenter', 'wall-line-points', () => {
        if (map.current) {
          map.current.getCanvas().style.cursor = 'grab';
        }
      });

      map.current?.on('mouseleave', 'wall-line-points', () => {
        if (map.current && !isDraggingWallLine) {
          map.current.getCanvas().style.cursor = '';
        }
      });

      setTimeout(() => {
        if (map.current) {
          map.current.resize();
        }
      }, 200);
    });

    return () => {
      cleanupDragListeners();
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, isLoadingToken, centerLat, centerLng, currentMapStyle, selectedWallLineId]);

  // Update draw styles when color changes
  useEffect(() => {
    if (!draw.current || !map.current || !mapInitialized) return;

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
    } catch (error) {
      console.error('Error updating draw styles:', error);
    }
  }, [selectedColor, mapInitialized]);

  // Update freehand line color
  useEffect(() => {
    if (!map.current || !mapInitialized) return;
    
    map.current.setPaintProperty('freehand-lines-layer', 'line-color', selectedColor);
  }, [selectedColor, mapInitialized]);

  // Resize handler
  useEffect(() => {
    if (map.current && mapInitialized) {
      const resizeTimer = setTimeout(() => {
        map.current?.resize();
      }, 100);
      
      return () => clearTimeout(resizeTimer);
    }
  }, [mapInitialized]);

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
      map.current.easeTo({ pitch: 60, bearing: 45, duration: 1000 });
      setIs3DEnabled(true);
      toast.success('3D terrain enabled');
    } else {
      map.current.setTerrain(null);
      map.current.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
      setIs3DEnabled(false);
      toast.success('3D terrain disabled');
    }
  };

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
        currentSegment={currentSegment}
        totalSegments={getTotalSegments()}
        segmentDistance={segmentDistance}
        onTransparentChoice={() => handleWallChoice('transparent', map.current!, draw)}
        onWhiteChoice={() => handleWallChoice('white', map.current!, draw)}
        onCancel={() => cancelWallSelection(map.current!)}
      />

      {/* Map Controls */}
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
