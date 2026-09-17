/**
 * Real continents from Natural Earth 1:110m land polygons (public domain), served from
 * /public/data/ne_110m_land.geojson (138 KB, 127 polygons, ~5k points). Loaded once, shared by
 * the 3D LandLayer (extruded onto the ocean world) and the 2D region mini-maps on case-file
 * cards (drawn as SVG). Raw lon/lat rings are kept; each consumer projects them itself.
 */

export type LonLat = [number, number];

export interface LandPolygon {
  /** Outer ring first, then holes (GeoJSON winding). */
  rings: LonLat[][];
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

interface GeoJsonFeature {
  bbox?: [number, number, number, number];
  geometry: { type: "Polygon"; coordinates: LonLat[][] };
}

let cache: Promise<LandPolygon[]> | null = null;

export function loadCoastline(): Promise<LandPolygon[]> {
  if (!cache) {
    cache = fetch("/data/ne_110m_land.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`coastline fetch failed: ${r.status}`);
        return r.json() as Promise<{ features: GeoJsonFeature[] }>;
      })
      .then((geo) =>
        geo.features.map((f) => {
          const rings = f.geometry.coordinates;
          let minLon = Infinity;
          let minLat = Infinity;
          let maxLon = -Infinity;
          let maxLat = -Infinity;
          for (const [lon, lat] of rings[0]) {
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
          }
          return { rings, bbox: [minLon, minLat, maxLon, maxLat] };
        }),
      );
  }
  return cache;
}

/**
 * SVG path data for every land polygon that overlaps a lon/lat box, in a coordinate space where
 * x = lon and y = -lat (so north is up). Pair with an SVG viewBox of
 * `${minLon} ${-maxLat} ${maxLon - minLon} ${maxLat - minLat}` for a region mini-map.
 */
export function landPathsInBox(
  land: LandPolygon[],
  box: { minLon: number; minLat: number; maxLon: number; maxLat: number },
): string {
  const parts: string[] = [];
  for (const polygon of land) {
    const [a, b, c, d] = polygon.bbox;
    if (c < box.minLon || a > box.maxLon || d < box.minLat || b > box.maxLat) continue;
    for (const ring of polygon.rings) {
      parts.push(
        ring
          .map(([lon, lat], i) => `${i === 0 ? "M" : "L"}${lon.toFixed(2)} ${(-lat).toFixed(2)}`)
          .join("") + "Z",
      );
    }
  }
  return parts.join("");
}
