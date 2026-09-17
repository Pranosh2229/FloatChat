import * as THREE from "three";

/**
 * Altitude bands (REDESIGN_PLAN.md decision #3): scroll moves the camera between these discrete
 * heights with an eased transition, never a continuous linear zoom. Each band also sets how far
 * the camera tilts off vertical — low bands are oblique and cinematic (you see the horizon),
 * high bands look more straight down so the 11 regions read as a map.
 */
export interface AltitudeBand {
  key: "surface" | "floats" | "region" | "world";
  label: string;
  /** Camera-to-target distance, world units (see geo.ts — a region is ~2 units across). */
  distance: number;
  /** Tilt off vertical, degrees. 0 = straight down. */
  tiltDeg: number;
  /** How far toward a pole the camera target may go at this band — tuned so the pole itself
   * stays in view at the edge of the frame but you can't scroll past it into nothing. */
  maxLat: number;
  /** Same for longitude — how close to the map's two ends the target may travel. */
  maxLon: number;
}

export const BANDS: AltitudeBand[] = [
  { key: "surface", label: "Surface", distance: 0.7, tiltDeg: 64, maxLat: 88, maxLon: 178 },
  { key: "floats", label: "Float level", distance: 2.4, tiltDeg: 50, maxLat: 84, maxLon: 172 },
  { key: "region", label: "Region", distance: 6.5, tiltDeg: 36, maxLat: 72, maxLon: 150 },
  { key: "world", label: "Whole ocean", distance: 17, tiltDeg: 14, maxLat: 25, maxLon: 40 },
];

export const DEFAULT_BAND = 2; // "region" — enough context to orient, close enough to see floats

export function bandIndex(key: AltitudeBand["key"]): number {
  return BANDS.findIndex((b) => b.key === key);
}

/**
 * Live camera-rig state, owned by `WorldNavigator` and mutated every frame. Deliberately a
 * plain mutable object (not zustand state): float scaling, fog and region-label fading all read
 * it inside `useFrame`, and pushing per-frame values through React state would re-render the
 * whole scene 60 times a second (the same reason FloatLayer applies timeline scale in useFrame).
 */
export const cameraRig = {
  /** Point on the sea surface the camera orbits/looks at. */
  target: new THREE.Vector3(0, 0, 0),
  /** Current (possibly mid-transition) distance and tilt. */
  distance: BANDS[DEFAULT_BAND].distance,
  tiltDeg: BANDS[DEFAULT_BAND].tiltDeg,
  band: DEFAULT_BAND,
};


/** Places `camera` south of the rig target at the rig's distance/tilt, looking north at it. */
export function applyRigToCamera(camera: THREE.Camera): void {
  const tilt = THREE.MathUtils.degToRad(cameraRig.tiltDeg);
  camera.position.set(
    cameraRig.target.x,
    cameraRig.target.y + cameraRig.distance * Math.cos(tilt),
    cameraRig.target.z + cameraRig.distance * Math.sin(tilt),
  );
  camera.lookAt(cameraRig.target);
}

/** Imperative hooks for the on-screen buttons (WorldControls.tsx); registered by WorldNavigator
 * while it is mounted so the DOM controls never need to reach into the R3F tree. */
export interface NavigatorControls {
  pan: (key: "arrowup" | "arrowdown" | "arrowleft" | "arrowright", pressed: boolean) => void;
  zoom: (step: number) => void;
  nearestFloat: () => void;
  wholeOcean: () => void;
}

let controls: NavigatorControls | null = null;
export function setNavigatorControls(next: NavigatorControls | null): void {
  controls = next;
}
export function getNavigatorControls(): NavigatorControls | null {
  return controls;
}

/** Set true by `WorldNavigator` while a 2+-finger touch gesture (pinch-zoom) is active, so
 * `OceanSurface`'s single-finger drag-to-pan can bail out instead of fighting the pinch — same
 * "plain mutable, read every frame/event" reasoning as `cameraRig` above. */
export const inputState = { multiTouch: false };
