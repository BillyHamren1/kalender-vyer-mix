
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';
import { calculateDistance, formatDistance } from '../MapUtils';

export const useWallSelection = () => {
  const [showWallDialog, setShowWallDialog] = useState(false);
  const [pendingLine, setPendingLine] = useState<any>(null);
  const [pendingFeatureId, setPendingFeatureId] = useState<string | null>(null);
  const [currentSegment, setCurrentSegment] = useState(1);
  const [wallChoices, setWallChoices] = useState<('transparent' | 'white')[]>([]);
  const [highlightedWallId, setHighlightedWallId] = useState<string | null>(null);
  const wallLinesSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  const [wallLinesData, setWallLinesData] = useState<any[]>([]);
  const [selectedWallLineId, setSelectedWallLineId] = useState<string | null>(null);
  const [isDraggingWallLine, setIsDraggingWallLine] = useState(false);
  const [dragWallLineIndex, setDragWallLineIndex] = useState<number | null>(null);
  const [dragWallPointIndex, setDragWallPointIndex] = useState<number | null>(null);
  const [segmentDistance, setSegmentDistance] = useState<string>('');

  const highlightCurrentWall = (coordinates: number[][], segmentIndex: number, map: mapboxgl.Map) => {
    if (!map || !map.getSource('wall-highlight')) {
      console.error('Map or wall-highlight source not available');
      return;
    }

    let startPoint: number[], endPoint: number[];

    if (pendingLine?.geometry.type === 'Polygon') {
      // For rectangles/polygons
      startPoint = coordinates[segmentIndex];
      endPoint = coordinates[segmentIndex + 1] || coordinates[0];
    } else if (pendingLine?.geometry.type === 'LineString') {
      // For line strings
      if (segmentIndex < coordinates.length - 1) {
        startPoint = coordinates[segmentIndex];
        endPoint = coordinates[segmentIndex + 1];
      } else {
        console.warn('No more segments to highlight');
        return;
      }
    } else {
      console.warn('Unknown geometry type for highlighting');
      return;
    }

    console.log(`Highlighting segment ${segmentIndex + 1}:`, { startPoint, endPoint });

    // Calculate and display distance
    const distance = calculateDistance(startPoint, endPoint);
    setSegmentDistance(formatDistance(distance));

    // Create very prominent highlight
    const highlightFeature = {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [startPoint, endPoint]
      },
      properties: {
        segmentNumber: segmentIndex + 1,
        isCurrent: true
      }
    };

    try {
      const source = map.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
      source.setData({
        type: 'FeatureCollection',
        features: [highlightFeature]
      });
      console.log('Highlight feature set successfully');
    } catch (error) {
      console.error('Error setting highlight feature:', error);
    }

    // Add all segment numbers for context
    addAllSegmentNumbers(coordinates, map);
  };

  const addAllSegmentNumbers = (coordinates: number[][], map: mapboxgl.Map) => {
    if (!map || !map.getSource('segment-numbers')) {
      console.error('Map or segment-numbers source not available');
      return;
    }

    const features: any[] = [];
    
    if (pendingLine?.geometry.type === 'Polygon') {
      // For rectangles - 4 segments
      for (let i = 0; i < 4; i++) {
        const startPoint = coordinates[i];
        const endPoint = coordinates[i + 1] || coordinates[0];
        const midPoint = [
          (startPoint[0] + endPoint[0]) / 2,
          (startPoint[1] + endPoint[1]) / 2
        ];
        
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: midPoint
          },
          properties: {
            segmentNumber: i + 1,
            isCurrent: i === currentSegment - 1
          }
        });
      }
    } else if (pendingLine?.geometry.type === 'LineString') {
      // For line strings
      for (let i = 0; i < coordinates.length - 1; i++) {
        const startPoint = coordinates[i];
        const endPoint = coordinates[i + 1];
        const midPoint = [
          (startPoint[0] + endPoint[0]) / 2,
          (startPoint[1] + endPoint[1]) / 2
        ];
        
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: midPoint
          },
          properties: {
            segmentNumber: i + 1,
            isCurrent: i === currentSegment - 1
          }
        });
      }
    }

    console.log(`Adding ${features.length} segment number features`, features);

    try {
      const source = map.getSource('segment-numbers') as mapboxgl.GeoJSONSource;
      source.setData({
        type: 'FeatureCollection',
        features
      });
      console.log('Segment numbers set successfully');
    } catch (error) {
      console.error('Error setting segment numbers:', error);
    }
  };

  const clearWallHighlight = (map: mapboxgl.Map) => {
    if (!map) return;

    console.log('Clearing wall highlights');

    if (map.getSource('wall-highlight')) {
      const source = map.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }

    if (map.getSource('segment-numbers')) {
      const source = map.getSource('segment-numbers') as mapboxgl.GeoJSONSource;
      source.setData({
        type: 'FeatureCollection',
        features: []
      });
    }

    setSegmentDistance('');
  };

  const getTotalSegments = () => {
    if (!pendingLine) return 0;
    
    if (pendingLine.geometry.type === 'Polygon') {
      return 4; // Rectangle has 4 sides
    } else if (pendingLine.geometry.type === 'LineString') {
      return pendingLine.geometry.coordinates.length - 1; // Number of segments
    }
    return 0;
  };

  const handleWallChoice = (choice: 'transparent' | 'white', map: mapboxgl.Map, draw: React.MutableRefObject<any>) => {
    console.log(`Wall choice made: ${choice} for segment ${currentSegment}`);
    
    const newChoices = [...wallChoices, choice];
    setWallChoices(newChoices);
    
    if (pendingLine && wallLinesSource.current) {
      const coordinates = pendingLine.geometry.coordinates;
      let startPoint: number[], endPoint: number[];

      if (pendingLine.geometry.type === 'Polygon') {
        const currentIndex = currentSegment - 1;
        startPoint = coordinates[0][currentIndex];
        endPoint = coordinates[0][currentIndex + 1] || coordinates[0][0];
      } else if (pendingLine.geometry.type === 'LineString') {
        const currentIndex = currentSegment - 1;
        startPoint = coordinates[currentIndex];
        endPoint = coordinates[currentIndex + 1];
      } else {
        return;
      }
      
      const lineColor = choice === 'transparent' ? '#3b82f6' : '#000000';
      
      const newLineFeature = {
        type: "Feature" as const,
        geometry: {
          type: "LineString" as const,
          coordinates: [startPoint, endPoint]
        },
        properties: {
          color: lineColor,
          wallType: choice,
          id: `wall-${Date.now()}-${currentSegment}`
        }
      };
      
      const updatedWallLines = [...wallLinesData, newLineFeature];
      setWallLinesData(updatedWallLines);
      
      wallLinesSource.current.setData({
        type: 'FeatureCollection',
        features: updatedWallLines
      });
      
      console.log(`Added ${choice} wall line with color ${lineColor}, distance: ${segmentDistance}`);
    }
    
    const totalSegments = getTotalSegments();
    if (currentSegment < totalSegments) {
      const nextSegment = currentSegment + 1;
      setCurrentSegment(nextSegment);
      
      // Highlight the next segment
      if (pendingLine) {
        const coordinates = pendingLine.geometry.coordinates;
        highlightCurrentWall(coordinates, nextSegment - 1, map);
      }
    } else {
      // All segments processed, clean up
      setShowWallDialog(false);
      clearWallHighlight(map);
      
      // Now remove the original drawn feature
      if (pendingFeatureId && draw.current) {
        draw.current.delete(pendingFeatureId);
      }
      
      setPendingLine(null);
      setPendingFeatureId(null);
      setCurrentSegment(1);
      setWallChoices([]);
      setSegmentDistance('');
      const shapeType = pendingLine?.geometry.type === 'Polygon' ? 'Rectangle' : 'Line';
      toast.success(`${shapeType} with wall choices completed!`);
    }
  };

  const cancelWallSelection = (map: mapboxgl.Map) => {
    console.log('Canceling wall selection');
    setShowWallDialog(false);
    clearWallHighlight(map);
    setPendingLine(null);
    setPendingFeatureId(null);
    setCurrentSegment(1);
    setWallChoices([]);
    setSegmentDistance('');
    toast.info('Wall selection cancelled');
  };

  const deleteSelectedWallLine = () => {
    if (!selectedWallLineId) return;

    const updatedWallLines = wallLinesData.filter(
      line => line.properties.id !== selectedWallLineId
    );
    
    setWallLinesData(updatedWallLines);
    setSelectedWallLineId(null);
    
    if (wallLinesSource.current) {
      wallLinesSource.current.setData({
        type: 'FeatureCollection',
        features: updatedWallLines
      });
    }
    
    toast.success('Wall line deleted');
  };

  return {
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
  };
};
