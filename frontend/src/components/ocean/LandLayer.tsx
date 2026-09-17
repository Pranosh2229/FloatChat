"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { TessellateModifier } from "three/examples/jsm/modifiers/TessellateModifier.js";

import { loadCoastline, type LandPolygon } from "@/lib/coastline";
import { WORLD_SCALE } from "./geo";
import { bendMaterial } from "./worldCurvature";

// Land sits a hair above the wave crests so the coastline is never lapped over by the water
// mesh, and the outline a hair above the land so it always draws on top.
const LAND_HEIGHT = 0.055;
const LAND_THICKNESS = 0.05;
const OUTLINE_HEIGHT = LAND_HEIGHT + 0.002;

function ringToShapePoints(ring: [number, number][]): THREE.Vector2[] {
  // Shape space is XY; we lay it flat with a -90° X rotation, so shape y = north = -world z.
  return ring.map(([lon, lat]) => new THREE.Vector2(lon * WORLD_SCALE, lat * WORLD_SCALE));
}

function buildLand(polygons: LandPolygon[]): {
  geometry: THREE.BufferGeometry;
  outline: THREE.BufferGeometry;
} {
  const shapes: THREE.Shape[] = [];
  const outlinePositions: number[] = [];

  for (const polygon of polygons) {
    const [outer, ...holes] = polygon.rings;
    const shape = new THREE.Shape(ringToShapePoints(outer));
    for (const hole of holes) shape.holes.push(new THREE.Path(ringToShapePoints(hole)));
    shapes.push(shape);

    for (const ring of polygon.rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];
        outlinePositions.push(
          lon1 * WORLD_SCALE, OUTLINE_HEIGHT, -lat1 * WORLD_SCALE,
          lon2 * WORLD_SCALE, OUTLINE_HEIGHT, -lat2 * WORLD_SCALE,
        );
      }
    }
  }

  // A thin extrusion rather than a flat sheet: the coast reads as a real edge you could sail
  // up to, and the side faces catch the sun from the low band.
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: LAND_THICKNESS,
    bevelEnabled: false,
  });
  // Extrude builds along +Z; rotate so it lies on XZ with its top at LAND_HEIGHT.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, LAND_HEIGHT - LAND_THICKNESS, 0);

  // The world curvature (worldCurvature.ts) bends vertices, and a continent's top face is a few
  // enormous triangles — their flat middles would sag below the densely-gridded water and the
  // sea would show through the land. Split every long edge so land follows the same curve.
  const tessellated = new TessellateModifier(0.4, 10).modify(geometry);
  geometry.dispose();

  const outline = new THREE.BufferGeometry();
  outline.setAttribute("position", new THREE.Float32BufferAttribute(outlinePositions, 3));
  return { geometry: tessellated, outline };
}

const builtCache = new WeakMap<LandPolygon[], ReturnType<typeof buildLand>>();

/**
 * Real continents on the flat ocean world (Natural Earth 110m, see lib/coastline.ts) — the
 * landmarks the user asked for so the world is legible as a map, not "infinite empty water."
 * Sand-coloured, hairline graphite coastline, built once from the GeoJSON.
 */
export function LandLayer() {
  const [polygons, setPolygons] = useState<LandPolygon[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCoastline()
      .then((p) => {
        if (!cancelled) setPolygons(p);
      })
      .catch((error) => console.error("Failed to load coastline:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // Built once per dataset and shared: the world is drawn three times (Scene.tsx), and
  // triangulating 127 polygons per copy would be pointless work.
  const built = useMemo(() => {
    if (!polygons) return null;
    if (!builtCache.has(polygons)) builtCache.set(polygons, buildLand(polygons));
    return builtCache.get(polygons)!;
  }, [polygons]);

  if (!built) return null;

  return (
    <group>
      <mesh geometry={built.geometry} raycast={() => {}} receiveShadow>
        <meshStandardMaterial ref={bendMaterial} color="#d9c9a3" roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={built.outline} raycast={() => {}}>
        <lineBasicMaterial ref={bendMaterial} color="#1a1a1a" transparent opacity={0.55} toneMapped={false} />
      </lineSegments>
    </group>
  );
}
