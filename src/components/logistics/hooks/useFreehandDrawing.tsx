
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { toast } from 'sonner';

export const useFreehandDrawing = (
  map: React.MutableRefObject<mapboxgl.Map | null>,
  draw: React.MutableRefObject<MapboxDraw | null>,
  selectedColor: string
) => {
  const [isFreehandDrawing, setIsFreehandDrawing] = useState(false);
  const [freehandPoints, setFreehandPoints] = useState<number[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const freehandSource = useRef<mapboxgl.GeoJSONSource | null>(null);

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

  const toggleFreehandDrawing = () => {
    if (!map.current) return;

    if (!isFreehandDrawing) {
      if (draw.current) {
        draw.current.changeMode('simple_select');
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

  return {
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
  };
};
