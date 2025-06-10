
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';
import { highlightWallSegment, clearWallHighlight } from './utils/wallHighlighting';
import { addWallArrow } from './utils/wallArrows';
import { handleWallChoice as handleWallChoiceUtil, cancelWallSelection as cancelWallSelectionUtil, updateWallLinesAndLabels } from './utils/wallChoiceHandler';

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

  const highlightCurrentWall = (coordinates: number[][][] | number[][], segmentIndex: number, map: mapboxgl.Map) => {
    const points = highlightWallSegment(coordinates, segmentIndex, map, pendingLine, setSegmentDistance);
    if (points) {
      addWallArrow(points.startPoint, points.endPoint, segmentIndex, map);
    }
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
    handleWallChoiceUtil(
      choice,
      currentSegment,
      wallChoices,
      setWallChoices,
      pendingLine,
      wallLinesSource,
      wallLinesData,
      setWallLinesData,
      segmentDistance,
      getTotalSegments,
      setCurrentSegment,
      highlightCurrentWall,
      setShowWallDialog,
      clearWallHighlight,
      pendingFeatureId,
      draw,
      setPendingLine,
      setPendingFeatureId,
      setSegmentDistance,
      map
    );
  };

  const cancelWallSelection = (map: mapboxgl.Map) => {
    cancelWallSelectionUtil(
      setShowWallDialog,
      clearWallHighlight,
      setPendingLine,
      setPendingFeatureId,
      setCurrentSegment,
      setWallChoices,
      setSegmentDistance,
      map
    );
  };

  const deleteSelectedWallLine = (map: mapboxgl.Map) => {
    if (!selectedWallLineId) return;

    const updatedWallLines = wallLinesData.filter(
      line => line.properties.id !== selectedWallLineId
    );
    
    setWallLinesData(updatedWallLines);
    setSelectedWallLineId(null);
    
    // Update both wall lines and distance labels
    updateWallLinesAndLabels(updatedWallLines, wallLinesSource, map);
    
    toast.success('Wall line deleted');
  };

  const updateWallLineData = (updatedWallLines: any[], map: mapboxgl.Map) => {
    setWallLinesData(updatedWallLines);
    updateWallLinesAndLabels(updatedWallLines, wallLinesSource, map);
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
    deleteSelectedWallLine,
    updateWallLineData
  };
};
