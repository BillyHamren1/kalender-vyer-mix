
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';

export const useWallSelection = () => {
  const [showWallDialog, setShowWallDialog] = useState(false);
  const [pendingRectangle, setPendingRectangle] = useState<any>(null);
  const [currentSide, setCurrentSide] = useState(1);
  const [wallChoices, setWallChoices] = useState<('transparent' | 'white')[]>([]);
  const [highlightedWallId, setHighlightedWallId] = useState<string | null>(null);
  const wallLinesSource = useRef<mapboxgl.GeoJSONSource | null>(null);
  const [wallLinesData, setWallLinesData] = useState<any[]>([]);
  const [selectedWallLineId, setSelectedWallLineId] = useState<string | null>(null);
  const [isDraggingWallLine, setIsDraggingWallLine] = useState(false);
  const [dragWallLineIndex, setDragWallLineIndex] = useState<number | null>(null);
  const [dragWallPointIndex, setDragWallPointIndex] = useState<number | null>(null);

  const highlightCurrentWall = (rectangleCoords: number[][], sideIndex: number, map: mapboxgl.Map) => {
    if (!map || !map.getSource('wall-highlight')) return;

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
  };

  const handleWallChoice = (choice: 'transparent' | 'white') => {
    const newChoices = [...wallChoices, choice];
    setWallChoices(newChoices);
    
    if (pendingRectangle && wallLinesSource.current) {
      const coordinates = pendingRectangle.geometry.coordinates[0];
      const currentIndex = currentSide - 1;
      const startPoint = coordinates[currentIndex];
      const endPoint = coordinates[currentIndex + 1] || coordinates[0];
      
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
          id: `wall-${Date.now()}-${currentIndex}`
        }
      };
      
      const updatedWallLines = [...wallLinesData, newLineFeature];
      setWallLinesData(updatedWallLines);
      
      wallLinesSource.current.setData({
        type: 'FeatureCollection',
        features: updatedWallLines
      });
      
      console.log(`Added ${choice} wall line with color ${lineColor}`);
    }
    
    if (currentSide < 4) {
      const nextSide = currentSide + 1;
      setCurrentSide(nextSide);
    } else {
      setShowWallDialog(false);
      setPendingRectangle(null);
      setCurrentSide(1);
      setWallChoices([]);
      toast.success('Rectangle with wall choices completed!');
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
    pendingRectangle,
    setPendingRectangle,
    currentSide,
    setCurrentSide,
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
    highlightCurrentWall,
    clearWallHighlight,
    handleWallChoice,
    deleteSelectedWallLine
  };
};
