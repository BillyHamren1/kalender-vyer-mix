
import mapboxgl from 'mapbox-gl';
import { toast } from 'sonner';
import { WallLineFeature } from '../types/wallSelectionTypes';

export const handleWallChoice = (
  choice: 'transparent' | 'white',
  currentSegment: number,
  wallChoices: ('transparent' | 'white')[],
  setWallChoices: (choices: ('transparent' | 'white')[]) => void,
  pendingLine: any,
  wallLinesSource: React.MutableRefObject<mapboxgl.GeoJSONSource | null>,
  wallLinesData: any[],
  setWallLinesData: (data: any[]) => void,
  segmentDistance: string,
  getTotalSegments: () => number,
  setCurrentSegment: (segment: number) => void,
  highlightCurrentWall: (coords: number[][][] | number[][], index: number, map: mapboxgl.Map) => void,
  setShowWallDialog: (show: boolean) => void,
  clearWallHighlight: (map: mapboxgl.Map) => void,
  pendingFeatureId: string | null,
  draw: React.MutableRefObject<any>,
  setPendingLine: (line: any) => void,
  setPendingFeatureId: (id: string | null) => void,
  setSegmentDistance: (distance: string) => void,
  map: mapboxgl.Map
) => {
  console.log(`Wall choice made: ${choice} for segment ${currentSegment}`);
  
  const newChoices = [...wallChoices, choice];
  setWallChoices(newChoices);
  
  if (pendingLine && wallLinesSource.current) {
    const coordinates = pendingLine.geometry.coordinates;
    let startPoint: number[], endPoint: number[];
    let actualCoords: number[][];

    if (pendingLine.geometry.type === 'Polygon') {
      // Handle Polygon coordinates correctly
      if (Array.isArray(coordinates) && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
        actualCoords = coordinates[0] as number[][];
      } else {
        actualCoords = coordinates as number[][];
      }
      const currentIndex = currentSegment - 1;
      startPoint = actualCoords[currentIndex];
      endPoint = actualCoords[currentIndex + 1] || actualCoords[0];
    } else if (pendingLine.geometry.type === 'LineString') {
      const currentIndex = currentSegment - 1;
      startPoint = coordinates[currentIndex];
      endPoint = coordinates[currentIndex + 1];
    } else {
      return;
    }
    
    const lineColor = choice === 'transparent' ? '#3b82f6' : '#000000';
    
    const newLineFeature: WallLineFeature = {
      type: "Feature",
      geometry: {
        type: "LineString",
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
    
    // Highlight the next segment immediately
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

export const cancelWallSelection = (
  setShowWallDialog: (show: boolean) => void,
  clearWallHighlight: (map: mapboxgl.Map) => void,
  setPendingLine: (line: any) => void,
  setPendingFeatureId: (id: string | null) => void,
  setCurrentSegment: (segment: number) => void,
  setWallChoices: (choices: ('transparent' | 'white')[]) => void,
  setSegmentDistance: (distance: string) => void,
  map: mapboxgl.Map
) => {
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
