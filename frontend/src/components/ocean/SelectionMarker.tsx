"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import * as THREE from "three";

import type { RegionSelection } from "./types";
import { cameraRig } from "./worldCamera";
import { bendMaterial } from "./worldCurvature";
import { getWorldPalette } from "./worldTheme";
import { useOceanStore } from "@/stores/oceanStore";

interface SelectionMarkerProps {
  selection: RegionSelection;
  reducedMotion: boolean;
}

/**
 * Marks a clicked point on the sea surface. A small pulse (paused under reduced-motion) so a
 * selection reads as "live," not a frozen decal. Scales with camera distance like the float
 * markers, so it stays a visible pin from every altitude band.
 */
export function SelectionMarker({ selection, reducedMotion }: SelectionMarkerProps) {
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const theme = useOceanStore((s) => s.theme);
  const cobalt = getWorldPalette(theme).marker.cobalt;

  useFrame(({ clock }) => {
    groupRef.current?.scale.setScalar(THREE.MathUtils.clamp(cameraRig.distance / 3, 1, 6));
    if (!ringRef.current || reducedMotion) return;
    const pulse = 1 + 0.25 * Math.sin(clock.getElapsedTime() * 2.5);
    ringRef.current.scale.setScalar(pulse);
  });

  return (
    <group ref={groupRef} position={[selection.point[0], 0.05, selection.point[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.035, 24]} />
        <meshBasicMaterial ref={bendMaterial} color={cobalt} toneMapped={false} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.065, 32]} />
        <meshBasicMaterial ref={bendMaterial} color={cobalt} toneMapped={false} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}
