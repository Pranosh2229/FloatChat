import * as THREE from "three";

import type { RegionInfo } from "@/lib/api";

/**
 * Redesign Phase 1: the world is one continuous, flat ocean surface (REDESIGN_PLAN.md
 * decisions #2/#3 — the globe is cut entirely), not a sphere. Real lat/lon maps onto the XZ
 * plane with a plain equirectangular projection: x grows east, z grows *south* (so +z is toward
 * the camera, which sits south of its target looking north — screen-up is north). y=0 is the
 * sea surface. The sphere-era `latLonToVector3`/`surfaceQuaternion` helpers are gone; floats
 * simply stand upright along +Y.
 */

/** World units per degree. 0.1 makes a typical 15-20° region ~2 units across — a comfortable
 * size relative to the procedural float model (~0.15 units tall, see argoFloatParts.ts). */
export const WORLD_SCALE = 0.1;

export function latLonToWorld(lat: number, lon: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(lon * WORLD_SCALE, y, -lat * WORLD_SCALE);
}

export function worldToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  return { lat: -point.z / WORLD_SCALE, lon: point.x / WORLD_SCALE };
}

/** Bounding-box midpoint — mirrors the backend's `app/ocean/regions.region_centroid`, used as
 * the camera fly-to target when a query names a region rather than a specific point. */
export function regionCentroid(region: RegionInfo): { lat: number; lon: number } {
  return {
    lat: (region.min_lat + region.max_lat) / 2,
    lon: (region.min_lon + region.max_lon) / 2,
  };
}
