
import { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { toast } from 'sonner';

interface DrawEvent {
  features: any[];
  type: string;
}

export const useMapEventHandlers = (
  map: React.MutableRefObject<mapboxgl.Map | null>,
  draw: React.MutableRefObject<MapboxDraw | null>,
  mapInitialized: boolean,
  setPendingLine: (line: any) => void,
  setCurrentSegment: (segment: number) => void,
  setWallChoices: (choices: ('transparent' | 'white')[]) => void,
  setShowWallDialog: (show: boolean) => void,
  highlightCurrentWall: (coords: number[][], index: number, map: mapboxgl.Map) => void,
  handleMeasurePointMouseDown: (e: mapboxgl.MapMouseEvent) => void,
  handleWallLineClick: (e: mapboxgl.MapMouseEvent) => void,
  handleWallPointMouseDown: (e: mapboxgl.MapMouseEvent) => void,
  selectedWallLineId: string | null,
  deleteSelectedWallLine: () => void
) => {
  useEffect(() => {
    if (!map.current || !draw.current || !mapInitialized) return;

    const handleDrawCreate = (e: DrawEvent) => {
      const feature = e.features[0];
      console.log('Created feature:', feature);
      
      if (feature.geometry.type === 'Polygon') {
        console.log('Rectangle created, starting wall selection...');
        
        if (draw.current) {
          draw.current.delete(feature.id);
        }
        
        setPendingLine(feature);
        setCurrentSegment(1);
        setWallChoices([]);
        
        const coordinates = feature.geometry.coordinates[0];
        highlightCurrentWall(coordinates, 0, map.current!);
        
        setShowWallDialog(true);
      } else if (feature.geometry.type === 'LineString') {
        console.log('Line created, starting wall selection...');
        
        if (draw.current) {
          draw.current.delete(feature.id);
        }
        
        setPendingLine(feature);
        setCurrentSegment(1);
        setWallChoices([]);
        
        const coordinates = feature.geometry.coordinates;
        // For line strings, we treat each segment as a wall
        if (coordinates.length > 1) {
          highlightCurrentWall(coordinates, 0, map.current!);
          setShowWallDialog(true);
        }
      } else {
        toast.success(`${feature.geometry.type} created`);
      }
    };

    const handleDrawUpdate = (e: DrawEvent) => {
      console.log('Updated feature:', e.features[0]);
      toast.success(`${e.features[0].geometry.type} updated`);
    };

    const handleDrawDelete = (e: DrawEvent) => {
      console.log('Deleted features:', e.features);
      toast.success(`${e.features.length} feature(s) deleted`);
    };

    map.current.on('draw.create', handleDrawCreate);
    map.current.on('draw.update', handleDrawUpdate);
    map.current.on('draw.delete', handleDrawDelete);

    map.current.on('mousedown', 'measure-points-layer', handleMeasurePointMouseDown);
    map.current.on('click', 'wall-lines-layer', handleWallLineClick);
    map.current.on('mousedown', 'wall-line-points', handleWallPointMouseDown);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWallLineId) {
          deleteSelectedWallLine();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (map.current) {
        map.current.off('draw.create', handleDrawCreate);
        map.current.off('draw.update', handleDrawUpdate);
        map.current.off('draw.delete', handleDrawDelete);
        map.current.off('mousedown', 'measure-points-layer', handleMeasurePointMouseDown);
        map.current.off('click', 'wall-lines-layer', handleWallLineClick);
        map.current.off('mousedown', 'wall-line-points', handleWallPointMouseDown);
      }
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mapInitialized, selectedWallLineId]);
};
