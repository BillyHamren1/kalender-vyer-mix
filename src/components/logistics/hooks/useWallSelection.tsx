
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';
import { calculateDistance, formatDistance } from '../MapUtils';

export const useWallSelection = () => {
  const [showWallDialog, setShowWallDialog] = useState(false);
  const [pendingLine, setPendingLine] = useState<any>(null);
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
    if (!map || !map.getSource('wall-highlight')) return;

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
        return; // No more segments
      }
    } else {
      return;
    }

    // Calculate and display distance
    const distance = calculateDistance(startPoint, endPoint);
    setSegmentDistance(formatDistance(distance));

    const highlightFeature = {
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [startPoint, endPoint]
      },
      properties: {}
    };

    const source = map.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
    source.setData({
      type: 'FeatureCollection',
      features: [highlightFeature]
    });
  };

  const clearWallHighlight = (map: mapboxgl.Map) => {
    if (!map || !map.getSource('wall-highlight')) return;

    const source = map.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
    source.setData({
      type: 'FeatureCollection',
      features: []
    });
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

  const handleWallChoice = (choice: 'transparent' | 'white') => {
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
    } else {
      setShowWallDialog(false);
      setPendingLine(null);
      setCurrentSegment(1);
      setWallChoices([]);
      setSegmentDistance('');
      const shapeType = pendingLine?.geometry.type === 'Polygon' ? 'Rectangle' : 'Line';
      toast.success(`${shapeType} with wall choices completed!`);
    }
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
    deleteSelectedWallLine
  };
};
