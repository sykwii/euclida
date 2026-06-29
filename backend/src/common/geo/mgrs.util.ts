import * as mgrs from 'mgrs';

export interface LatLng {
  lat: number;
  lng: number;
}

export function normalizeMgrs(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = compact.match(/^(\d{1,2}[C-X])([A-Z]{2})(\d{5})(\d{5})$/);

  if (!match) {
    throw new Error('Invalid MGRS format');
  }

  const [, zone, square, easting, northing] = match;

  return `${zone} ${square} ${easting} ${northing}`;
}

export function mgrsToLatLng(value: string): LatLng {
  const normalized = normalizeMgrs(value).replace(/\s+/g, '');
  const point = mgrs.toPoint(normalized);

  return {
    lng: Number(point[0].toFixed(6)),
    lat: Number(point[1].toFixed(6)),
  };
}

export function latLngToMgrs(
  lat: number,
  lng: number,
): string {
  return normalizeMgrs(mgrs.forward([lng, lat], 5));
}
