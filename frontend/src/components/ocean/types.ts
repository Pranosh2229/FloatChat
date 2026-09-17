export interface LatLon {
  lat: number;
  lon: number;
}

export interface RegionSelection extends LatLon {
  /** World-space point on the sea surface (y is always 0), for placing the selection marker. */
  point: [number, number, number];
}
