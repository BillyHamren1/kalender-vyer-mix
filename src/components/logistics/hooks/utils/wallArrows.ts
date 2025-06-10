
import mapboxgl from 'mapbox-gl';
import { ArrowFeature } from '../types/wallSelectionTypes';

export const addWallArrow = (startPoint: number[], endPoint: number[], segmentIndex: number, map: mapboxgl.Map) => {
  if (!map) {
    console.error('Map not available for arrow');
    return;
  }
  
  if (!startPoint || !endPoint) {
    console.error(`Invalid points for segment ${segmentIndex}:`, { startPoint, endPoint });
    return;
  }
  
  // Calculate the midpoint of the current wall segment
  const midPoint = [
    (startPoint[0] + endPoint[0]) / 2,
    (startPoint[1] + endPoint[1]) / 2
  ];
  
  // Calculate the angle of the wall segment
  const dx = endPoint[0] - startPoint[0];
  const dy = endPoint[1] - startPoint[1];
  const wallAngle = Math.atan2(dy, dx) * 180 / Math.PI;
  
  // Calculate perpendicular angle (pointing toward the wall from outside)
  const arrowAngle = wallAngle + 90;
  
  // Calculate offset position (place arrow outside the wall, pointing toward it)
  const offsetDistance = 0.0001; // Small offset in degrees
  const offsetX = Math.cos((arrowAngle + 180) * Math.PI / 180) * offsetDistance;
  const offsetY = Math.sin((arrowAngle + 180) * Math.PI / 180) * offsetDistance;
  
  const arrowPosition = [
    midPoint[0] + offsetX,
    midPoint[1] + offsetY
  ];
  
  // Create arrow feature pointing AT the wall
  const arrowFeature: ArrowFeature = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: arrowPosition
    },
    properties: {
      segmentNumber: segmentIndex + 1,
      isCurrent: true,
      rotation: arrowAngle // Store rotation for the symbol layer
    }
  };

  console.log(`Adding arrow for segment ${segmentIndex + 1}`, arrowFeature);

  // Set the arrow - layers are guaranteed to exist now
  try {
    const segmentSource = map.getSource('segment-numbers') as mapboxgl.GeoJSONSource;
    segmentSource.setData({
      type: 'FeatureCollection',
      features: [arrowFeature]
    });
    console.log('Arrow set successfully');
  } catch (error) {
    console.error('Error setting arrow:', error);
  }
};
