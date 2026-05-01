/**
 * Build a GeoJSON polygon approximating a circle on the WGS84 ellipsoid.
 * Centre is [lng, lat], radius in metres.
 */
export default function circleToPolygon(
  center: [number, number],
  radiusMeters: number,
  steps = 64
): GeoJSON.Polygon {
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  const earthRadius = 6378137; // metres
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const d = radiusMeters / earthRadius;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return { type: "Polygon", coordinates: [coords] };
}
