
import { useState, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';

export const useMapState = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const [drawMode, setDrawMode] = useState<string>('simple_select');
  const [selectedColor, setSelectedColor] = useState<string>('#3bb2d0');
  const [isDrawingOpen, setIsDrawingOpen] = useState(true);
  const [currentMapStyle, setCurrentMapStyle] = useState<string>('mapbox://styles/mapbox/satellite-streets-v12');
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);

  return {
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
  };
};
