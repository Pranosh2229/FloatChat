"use client";

import { Suspense } from "react";

import { OceanSurface } from "./OceanSurface";
import { LandLayer } from "./LandLayer";
import { RegionLayer } from "./RegionLayer";
import { SelectionMarker } from "./SelectionMarker";
import { FloatLayer } from "./FloatLayer";
import { TrajectoryLayer } from "./TrajectoryLayer";
import { WorldNavigator } from "./WorldNavigator";
import { SUN_DIRECTION } from "./waterShader";
import { useOceanStore } from "@/stores/oceanStore";

interface SceneProps {
  reducedMotion: boolean;
}

/**
 * The persistent ocean world (Redesign Phase 1): one continuous procedural sea, real
 * continents, the 11 regions marked, real floats standing on the surface, and a free-roam
 * camera. No globe — the horizon fades into a pale paper-coloured haze.
 */
export function Scene({ reducedMotion }: SceneProps) {
  const selection = useOceanStore((s) => s.selection);

  return (
    <>
      {/* Same sun the water shader uses, so glints on the sea and highlights on floats/land
          agree on where the light is coming from. */}
      <directionalLight
        position={[SUN_DIRECTION.x * 10, SUN_DIRECTION.y * 10, SUN_DIRECTION.z * 10]}
        intensity={2.4}
        color="#fff4dc"
      />
      <hemisphereLight args={["#e9ecdf", "#2b3a30", 0.7]} />
      <ambientLight intensity={0.18} />

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
