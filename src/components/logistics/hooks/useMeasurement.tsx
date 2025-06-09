
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';
import { calculateDistance, formatDistance } from '../MapUtils';

export const useMeasurement = (map: React.MutableRefObject<mapboxgl.Map | null>) => {
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isDraggingMeasurePoint, setIsDraggingMeasurePoint] = useState(false);
  const [dragPointIndex, setDragPointIndex] = useState<number | null>(null);
  const measurePoints = useRef<number[][]>([]);
  const measureSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  
  const [liveMeasurement, setLiveMeasurement] = useState<{
    distance: string;
    x: number;
    y: number;
    visible: boolean;
  }>({ distance: '', x: 0, y: 0, visible: false });

  const dragHandlers = useRef<{
    mousemove?: (e: MouseEvent) => void;
    mouseup?: (e: MouseEvent) => void;
  }>({});

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

  const toggleMeasuring = () => {
    if (!map.current) return;

    if (!isMeasuring) {
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

  return {
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
  };
};
