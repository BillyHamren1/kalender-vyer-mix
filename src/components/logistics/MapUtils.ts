
import mapboxgl from 'mapbox-gl';

export const calculateDistance = (point1: number[], point2: number[]): number => {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const formatDistance = (distance: number): string => {
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  } else {
    return `${(distance / 1000).toFixed(2)} km`;
  }
};

export const validateCoordinate = (value: string, min: number, max: number, type: string): number | undefined => {
  const num = parseFloat(value);
  if (isNaN(num)) {
    return undefined;
  }
  if (num < min || num > max) {
    return undefined;
  }
  return num;
};

export const getDisplayBookingNumber = (booking: any) => {
  if (booking.bookingNumber) {
    return `Booking #${booking.bookingNumber}`;
  }
  return `Booking #${booking.id.substring(0, 8)}...`;
};

export const createDrawStyles = (color: string) => [
  {
    'id': 'gl-draw-polygon-fill-inactive',
    'type': 'fill',
    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    'paint': {
      'fill-color': color,
      'fill-outline-color': color,
      'fill-opacity': 0.1
    }
  },
  {
    'id': 'gl-draw-polygon-fill-active',
    'type': 'fill',
    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    'paint': {
      'fill-color': color,
      'fill-outline-color': color,
      'fill-opacity': 0.2
    }
  },
  {
    'id': 'gl-draw-polygon-stroke-inactive',
    'type': 'line',
    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    'layout': {
      'line-cap': 'round',
      'line-join': 'round'
    },
    'paint': {
      'line-color': color,
      'line-width': 2
    }
  },
  {
    'id': 'gl-draw-polygon-stroke-active',
    'type': 'line',
    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
    'layout': {
      'line-cap': 'round',
      'line-join': 'round'
    },
    'paint': {
      'line-color': color,
      'line-width': 3
    }
  },
  {
    'id': 'gl-draw-line-inactive',
    'type': 'line',
    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
    'layout': {
      'line-cap': 'round',
      'line-join': 'round'
    },
    'paint': {
      'line-color': color,
      'line-width': 2
    }
  },
  {
    'id': 'gl-draw-line-active',
    'type': 'line',
    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
    'layout': {
      'line-cap': 'round',
      'line-join': 'round'
    },
    'paint': {
      'line-color': color,
      'line-width': 3
    }
  },
  {
    'id': 'gl-draw-point-inactive',
    'type': 'circle',
    'filter': ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    'paint': {
      'circle-radius': 5,
      'circle-color': color,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  },
  {
    'id': 'gl-draw-point-active',
    'type': 'circle',
    'filter': ['all', ['==', 'active', 'true'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    'paint': {
      'circle-radius': 7,
      'circle-color': color,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2
    }
  },
  {
    'id': 'gl-draw-polygon-and-line-vertex-stroke-inactive',
    'type': 'circle',
    'filter': ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
    'paint': {
      'circle-radius': 5,
      'circle-color': '#fff',
      'circle-stroke-color': color,
      'circle-stroke-width': 2
    }
  }
];

export const colorOptions = [
  '#3bb2d0', // Default blue
  '#ff0000', // Red
  '#00ff00', // Green
  '#fbb03b', // Orange
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#ef4444', // Red variant
  '#10b981', // Emerald
  '#6366f1', // Indigo
];
