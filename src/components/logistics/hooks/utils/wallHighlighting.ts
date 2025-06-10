
import mapboxgl from 'mapbox-gl';
import { calculateDistance, formatDistance } from '../../MapUtils';
import { HighlightFeature } from '../types/wallSelectionTypes';

export const ensureHighlightLayersExist = (map: mapboxgl.Map) => {
  console.log('Ensuring highlight layers exist...');
  
  // Check and create wall-highlight source and layer
  if (!map.getSource('wall-highlight')) {
    console.log('Creating wall-highlight source');
    map.addSource('wall-highlight', {
      'type': 'geojson',
      'data': { 'type': 'FeatureCollection', 'features': [] }
    });
  }
  
  if (!map.getLayer('wall-highlight-layer')) {
    console.log('Creating wall-highlight-layer');
    map.addLayer({
      'id': 'wall-highlight-layer',
      'type': 'line',
      'source': 'wall-highlight',
      'layout': { 'line-cap': 'round', 'line-join': 'round' },
      'paint': {
        'line-color': '#FF1493', // Bright deep pink - very visible
        'line-width': 12, // Much thicker
        'line-opacity': 0.9,
        'line-blur': 2 // Add glow effect
      }
    });
  }
  
  // Check and create segment-numbers source and layer
  if (!map.getSource('segment-numbers')) {
    console.log('Creating segment-numbers source');
    map.addSource('segment-numbers', {
      'type': 'geojson',
      'data': { 'type': 'FeatureCollection', 'features': [] }
    });
  }
  
  if (!map.getLayer('wall-arrow-layer')) {
    console.log('Creating wall-arrow-layer');
    map.addLayer({
      'id': 'wall-arrow-layer',
      'type': 'symbol',
      'source': 'segment-numbers',
      'layout': {
        'text-field': '▼', // Use downward arrow that will be rotated
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 24,
        'text-anchor': 'center',
        'text-rotate': ['get', 'rotation'], // Use the rotation from properties
        'text-rotation-alignment': 'map'
      },
      'paint': {
        'text-color': '#FF1493',
        'text-halo-color': '#ffffff',
        'text-halo-width': 3
      }
    });
  }
  
  console.log('All highlight layers ensured to exist');
};

export const highlightWallSegment = (
  coordinates: number[][][] | number[][],
  segmentIndex: number,
  map: mapboxgl.Map,
  pendingLine: any,
  setSegmentDistance: (distance: string) => void
) => {
  console.log('highlightWallSegment called with segmentIndex:', segmentIndex);
  
  if (!map) {
    console.error('Map not available');
    return;
  }

  // FIRST: Ensure all required layers exist
  ensureHighlightLayersExist(map);

  console.log('Raw coordinates received:', coordinates);
  console.log('Pending line geometry type:', pendingLine?.geometry.type);

  let startPoint: number[], endPoint: number[];
  let actualCoords: number[][];

  // Handle different coordinate structures properly
  if (pendingLine?.geometry.type === 'Polygon') {
    // Polygon coordinates are [[[x,y], [x,y], [x,y], [x,y], [x,y]]]
    // We need the first (and only) ring: coordinates[0]
    if (Array.isArray(coordinates) && Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
      // coordinates is number[][][] - extract first ring
      actualCoords = (coordinates as number[][][])[0];
    } else {
      console.error('Invalid polygon coordinate structure');
      return;
    }
    console.log('Extracted polygon ring coordinates:', actualCoords);
    
    startPoint = actualCoords[segmentIndex];
    endPoint = actualCoords[segmentIndex + 1] || actualCoords[0];
  } else if (pendingLine?.geometry.type === 'LineString') {
    // LineString coordinates are [[x,y], [x,y], [x,y]]
    actualCoords = coordinates as number[][];
    if (segmentIndex < actualCoords.length - 1) {
      startPoint = actualCoords[segmentIndex];
      endPoint = actualCoords[segmentIndex + 1];
    } else {
      console.warn('No more segments to highlight');
      return;
    }
  } else {
    console.warn('Unknown geometry type for highlighting');
    return;
  }

  console.log(`Highlighting segment ${segmentIndex + 1}:`, { startPoint, endPoint });

  if (!startPoint || !endPoint) {
    console.error('Invalid start or end point:', { startPoint, endPoint });
    return;
  }

  // Calculate and display distance
  const distance = calculateDistance(startPoint, endPoint);
  setSegmentDistance(formatDistance(distance));

  // Create very prominent highlight
  const highlightFeature: HighlightFeature = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [startPoint, endPoint]
    },
    properties: {
      segmentNumber: segmentIndex + 1,
      isCurrent: true
    }
  };

  // Set the highlight - layers are guaranteed to exist now
  try {
    const highlightSource = map.getSource('wall-highlight') as mapboxgl.GeoJSONSource;
    highlightSource.setData({
      type: 'FeatureCollection',
      features: [highlightFeature]
    });
    console.log('Highlight feature set successfully:', highlightFeature);
  } catch (error) {
    console.error('Error setting highlight feature:', error);
  }

  return { startPoint, endPoint };
};

export const clearWallHighlight = (map: mapboxgl.Map, setSegmentDistance: (distance: string) => void) => {
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
