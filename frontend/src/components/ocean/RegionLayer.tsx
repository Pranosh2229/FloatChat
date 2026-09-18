"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

import { useOceanStore } from "@/stores/oceanStore";
import { latLonToWorld, regionCentroid } from "./geo";
import { cameraRig } from "./worldCamera";
import { bendMaterial, curvatureDrop } from "./worldCurvature";
import { getWorldPalette } from "./worldTheme";

const OUTLINE_HEIGHT = 0.06;
const worldPos = new THREE.Vector3();
// Labels are only useful once you can see a whole region; at the surface band they'd be
// screen-filling text over a few floats, so they fade out below this camera distance.
const LABEL_FADE_START = 2.4;
const LABEL_FADE_END = 4.5;

/**
 * The 11 real regions as faint rectangles on the surface with a name label — the landmarks
 * that make free roaming legible (REDESIGN_PLAN.md decision #3: near the real regions, "not
 * truly infinite empty water"). Outlines are plain THREE.Line loops, same approach as
 * TrajectoryLayer (drei's fat `<Line>` is unreliable in this three/drei combination).
 */
export function RegionLayer() {
  const regions = useOceanStore((s) => s.regions);
  const theme = useOceanStore((s) => s.theme);
  const cobalt = getWorldPalette(theme).marker.cobalt;
  const labelRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const labelGroups = useRef<Map<string, THREE.Group | null>>(new Map());

  const outlines = useMemo(
    () =>
      regions.map((region) => {
        const corners = [
          latLonToWorld(region.min_lat, region.min_lon, OUTLINE_HEIGHT),
          latLonToWorld(region.min_lat, region.max_lon, OUTLINE_HEIGHT),
          latLonToWorld(region.max_lat, region.max_lon, OUTLINE_HEIGHT),
          latLonToWorld(region.max_lat, region.min_lon, OUTLINE_HEIGHT),
          latLonToWorld(region.min_lat, region.min_lon, OUTLINE_HEIGHT),
        ];
        const positions = new Float32Array(corners.length * 3);
        corners.forEach((c, i) => {
          positions[i * 3] = c.x;
          positions[i * 3 + 1] = c.y;
          positions[i * 3 + 2] = c.z;
        });
        const { lat, lon } = regionCentroid(region);
        return {
          region,
          positions,
          labelPosition: latLonToWorld(lat, lon, 0.05),
        };
      }),
    [regions],
  );

  useFrame(() => {
    const opacity = THREE.MathUtils.clamp(
      (cameraRig.distance - LABEL_FADE_START) /
        (LABEL_FADE_END - LABEL_FADE_START),
      0,
      1,
    );
    for (const el of labelRefs.current.values()) {
      if (el) el.style.opacity = String(opacity);
    }
    // Html labels aren't shader-bent, so drop them by the same curve as everything else.
    for (const g of labelGroups.current.values()) {
      if (!g) continue;
      g.getWorldPosition(worldPos);
      g.position.y = -curvatureDrop(worldPos.x, worldPos.z);
    }
  });

  if (outlines.length === 0) return null;

  return (
    <group>
      {outlines.map(({ region, positions, labelPosition }) => (
        <group key={region.key}>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial
              ref={bendMaterial}
              color={cobalt}
              transparent
              opacity={0.55}
              toneMapped={false}
            />
          </line>
          <group
            ref={(g) => {
              labelGroups.current.set(region.key, g);
            }}
            position={[labelPosition.x, 0, labelPosition.z]}
          >
            <Html
              position={[0, 0.05, 0]}
              center
              zIndexRange={[5, 0]}
              style={{ pointerEvents: "none", transition: "opacity 200ms" }}
            >
              <div
                ref={(el) => {
                  labelRefs.current.set(region.key, el);
                }}
                className="card whitespace-nowrap !rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-[0.18em] text-[var(--graphite)] uppercase"
              >
                {region.name}
              </div>
            </Html>
          </group>
        </group>
      ))}
    </group>
  );
}
