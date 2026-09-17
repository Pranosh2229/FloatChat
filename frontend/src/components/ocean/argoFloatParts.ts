import * as THREE from "three";

/**
 * A real ARGO float's silhouette, built from primitives (no imported asset — this is a from-
 * scratch procedural model, matched by eye to a reference photo of the actual instrument): a
 * tall yellow flotation body, a white collar band, a grey electronics housing, a thin antenna
 * mast, a top sensor, and a small side-mounted controller box. Each part is its own geometry,
 * pre-translated in model space (float base at local origin, model built along +Y) so that
 * instancing every part at the same per-float position assembles the whole float as one rigid
 * unit standing upright on the sea surface (y=0 in the flat world, see geo.ts).
 *
 * Multiple parts means multiple `<Instances>` draw calls (one per part, not one per float) —
 * ~6 draw calls total regardless of float count, still trivial for a scene this size.
 */

export interface FloatPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

function translated(geometry: THREE.BufferGeometry, y: number, x = 0, z = 0): THREE.BufferGeometry {
  geometry.translate(x, y, z);
  return geometry;
}

// Vertical layout (model space, base at y=0; ~0.15 units total, ≈1.5° of latitude at WORLD_SCALE):
const BASE_H = 0.02;
const BODY_H = 0.075;
const RING_H = 0.006;
const CAP_H = 0.022;
const ANTENNA_H = 0.026;

const BASE_TOP = BASE_H;
const BODY_TOP = BASE_TOP + BODY_H;
const RING_TOP = BODY_TOP + RING_H;
const CAP_TOP = RING_TOP + CAP_H;
const ANTENNA_TOP = CAP_TOP + ANTENNA_H;

export function buildArgoFloatParts(): Record<string, FloatPart> {
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: "#f2c318", // authentic ARGO-float yellow, not a generic bright yellow
    roughness: 0.55,
    metalness: 0.05,
  });
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: "#f4f4f5",
    roughness: 0.35,
    metalness: 0.1,
  });
  const housingMaterial = new THREE.MeshStandardMaterial({
    color: "#71717a",
    roughness: 0.4,
    metalness: 0.55,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: "#26262b",
    roughness: 0.3,
    metalness: 0.6,
  });

  return {
    base: {
      geometry: translated(new THREE.CapsuleGeometry(0.011, BASE_H * 0.4, 4, 8), BASE_H / 2),
      material: bodyMaterial,
    },
    body: {
      geometry: translated(
        new THREE.CylinderGeometry(0.011, 0.0115, BODY_H, 16),
        BASE_TOP + BODY_H / 2,
      ),
      material: bodyMaterial,
    },
    ring: {
      geometry: translated(new THREE.CylinderGeometry(0.0145, 0.0145, RING_H, 16), BODY_TOP + RING_H / 2),
      material: ringMaterial,
    },
    housing: {
      geometry: translated(new THREE.CylinderGeometry(0.0105, 0.0115, CAP_H, 12), RING_TOP + CAP_H / 2),
      material: housingMaterial,
    },
    antenna: {
      geometry: translated(new THREE.CylinderGeometry(0.0016, 0.0016, ANTENNA_H, 8), CAP_TOP + ANTENNA_H / 2),
      material: darkMaterial,
    },
    sensor: {
      geometry: translated(new THREE.SphereGeometry(0.005, 8, 8), ANTENNA_TOP),
      material: darkMaterial,
    },
    controllerBox: {
      geometry: translated(
        new THREE.BoxGeometry(0.008, 0.012, 0.006),
        BASE_TOP + 0.014,
        0.013,
      ),
      material: housingMaterial,
    },
  };
}

export const ARGO_FLOAT_TOTAL_HEIGHT = ANTENNA_TOP + 0.005;
