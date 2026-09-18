import * as THREE from "three";

/**
 * The 3D ocean world's day/night palettes (2026-09-19) — the counterpart to globals.css's
 * `[data-theme="dark"]` block, for the parts of Explore that CSS custom properties can't reach:
 * Three.js material colours and light objects don't read CSS variables, so this module is the
 * single place both themes' water/fog/land/lighting values live. Driven by the same
 * `oceanStore.theme` the rest of the UI uses — this is a resolution/colour swap only, never a
 * change to the wave animation, the geometry, or any 3D asset (same water shader, same
 * tessellated land, same instanced floats, in both themes).
 */

export interface WorldPalette {
  water: { deep: THREE.Color; lit: THREE.Color; horizon: THREE.Color; glint: THREE.Color };
  sunDirection: THREE.Vector3;
  fogColor: string;
  land: string;
  landOutline: string;
  directional: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  ambientIntensity: number;
  // Non-shader material colours used across FloatLayer/SelectionMarker/TrajectoryLayer/
  // RegionLayer. `markerGlow` in particular used to be a flat near-black (#1a1a1a) ring around a
  // hovered float — invisible against night water for the same reason the 2D illustrations'
  // black ink was invisible in dark mode, so night gets a pale glow instead.
  marker: { cobalt: string; coral: string; gold: string; glow: string };
}

export const DAY_PALETTE: WorldPalette = {
  water: {
    deep: new THREE.Color("#0b2f3a"),
    lit: new THREE.Color("#1b5e6b"),
    horizon: new THREE.Color("#c9d1c9"),
    glint: new THREE.Color("#f4c95d"),
  },
  sunDirection: new THREE.Vector3(0.45, 0.55, -0.7).normalize(),
  fogColor: "#cfd6cf",
  land: "#d9c9a3",
  landOutline: "#1a1a1a",
  directional: { color: "#fff4dc", intensity: 2.4 },
  hemisphere: { sky: "#e9ecdf", ground: "#2b3a30", intensity: 0.7 },
  ambientIntensity: 0.18,
  marker: { cobalt: "#1d4ed8", coral: "#f0562f", gold: "#f4c95d", glow: "#1a1a1a" },
};

// Night: the water goes near-black ink instead of tropical teal, the sun glint becomes a cooler
// silvery-blue "moonglint" (real moonlight is reflected sunlight — same specular mechanism, a
// different colour temperature), land reads as moonlit sand, and the sky/fog drop to a deep
// indigo rather than pale haze. The moon sits roughly opposite a "sunk" sun for a plausible
// grazing light angle, same as a real low moon.
export const NIGHT_PALETTE: WorldPalette = {
  water: {
    deep: new THREE.Color("#010a10"),
    lit: new THREE.Color("#04222b"),
    horizon: new THREE.Color("#1c2a3a"),
    glint: new THREE.Color("#cfe3f0"),
  },
  sunDirection: new THREE.Vector3(0.35, 0.4, -0.75).normalize(),
  fogColor: "#0b0f16",
  // A `meshStandardMaterial`'s on-screen colour is roughly albedo × light — the original
  // `#4a4536` land, combined with night's much-dimmer lights below, rendered as an almost
  // featureless black silhouette (confirmed live: only the pale outline was visible). Brightened
  // the albedo and the lights it's lit by together so land actually reads as moonlit sand again,
  // not just a black cutout.
  land: "#8c806a",
  landOutline: "#f0ead9",
  directional: { color: "#aac4e8", intensity: 1.3 },
  hemisphere: { sky: "#2a3550", ground: "#0d0d0d", intensity: 0.55 },
  ambientIntensity: 0.3,
  marker: { cobalt: "#5b8dff", coral: "#ff7a52", gold: "#f4c95d", glow: "#f0ead9" },
};

export function getWorldPalette(theme: "light" | "dark"): WorldPalette {
  return theme === "dark" ? NIGHT_PALETTE : DAY_PALETTE;
}
