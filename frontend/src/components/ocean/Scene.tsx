"use client";

import { Suspense } from "react";

import { OceanSurface } from "./OceanSurface";
import { LandLayer } from "./LandLayer";
import { RegionLayer } from "./RegionLayer";
import { SelectionMarker } from "./SelectionMarker";
import { FloatLayer } from "./FloatLayer";
import { TrajectoryLayer } from "./TrajectoryLayer";
import { WorldNavigator } from "./WorldNavigator";
import { getWorldPalette } from "./worldTheme";
import { useOceanStore } from "@/stores/oceanStore";

interface SceneProps {
  reducedMotion: boolean;
}

/**
 * The persistent ocean world (Redesign Phase 1): one continuous procedural sea, real
 * continents, the 11 regions marked, real floats standing on the surface, and a free-roam
 * camera. No globe — the horizon fades into a pale paper-coloured haze.
 *
 * Lighting follows the day/night palette (worldTheme.ts) reactively: these are plain light
 * props, not shader uniforms, so R3F re-applies them on every theme change with no manual
 * per-frame mutation needed (unlike the water's colour uniforms in OceanSurface.tsx).
 */
export function Scene({ reducedMotion }: SceneProps) {
  const selection = useOceanStore((s) => s.selection);
  const theme = useOceanStore((s) => s.theme);
  const palette = getWorldPalette(theme);
  const sun = palette.sunDirection;

  return (
    <>
      {/* Same sun the water shader uses, so glints on the sea and highlights on floats/land
          agree on where the light is coming from. */}
      <directionalLight
        position={[sun.x * 10, sun.y * 10, sun.z * 10]}
        intensity={palette.directional.intensity}
        color={palette.directional.color}
      />
      <hemisphereLight args={[palette.hemisphere.sky, palette.hemisphere.ground, palette.hemisphere.intensity]} />
      <ambientLight intensity={palette.ambientIntensity} />

      <Suspense fallback={null}>
        <OceanSurface reducedMotion={reducedMotion} />
        <LandLayer />
        <RegionLayer />
        <FloatLayer reducedMotion={reducedMotion} />
        <TrajectoryLayer />
        {selection && <SelectionMarker selection={selection} reducedMotion={reducedMotion} />}
      </Suspense>

      <WorldNavigator reducedMotion={reducedMotion} />
    </>
  );
}
