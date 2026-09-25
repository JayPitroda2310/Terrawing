/** Formats seconds as MM:SS. */
export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Heading in degrees (0 = north, clockwise) to a cardinal label. */
export function headingToCardinal(headingDeg: number): string {
  const normalized = ((headingDeg % 360) + 360) % 360;
  return CARDINALS[Math.round(normalized / 45) % 8]!;
}

/** Converts a local metric offset (x east, z south) to a GPS-style coordinate string. */
export function toGpsString(
  x: number,
  z: number,
  reference: { latitude: number; longitude: number },
): string {
  const metersPerDegLat = 111_320;
  const lat = reference.latitude - z / metersPerDegLat;
  const metersPerDegLon = metersPerDegLat * Math.cos((reference.latitude * Math.PI) / 180);
  const lon = reference.longitude + x / metersPerDegLon;
  const fmt = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(5)}°${v >= 0 ? pos : neg}`;
  return `${fmt(lat, 'N', 'S')} ${fmt(lon, 'E', 'W')}`;
}
