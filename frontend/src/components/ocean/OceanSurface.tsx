"use client";

import { useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, type ThreeEvent } from "@react-three/fiber";

import { cameraRig, inputState } from "./worldCamera";
import { worldToLatLon } from "./geo";
import { waterMaterialProps } from "./waterShader";
import { useOceanStore } from "@/stores/oceanStore";

// Big enough to reach past the fog from the top band; dense enough that the smallest swell
// (0.15 units) still has ~4 vertices per wavelength near the camera.
const PLANE_SIZE = 90;
const PLANE_SEGMENTS = 360;
// The plane re-centres on the camera target in steps of one cell, so its vertices never
// "swim" against the world-space wave field as the camera pans.
const CELL = PLANE_SIZE / PLANE_SEGMENTS;
// Moving the pointer more than this (world units) between down and up is a drag, not a click.
const CLICK_DRAG_THRESHOLD = 0.05;

/**
 * The persistent ocean world's surface: one continuous procedural water plane (see
 * waterShader.ts) that follows the camera, so the sea is endless and seamless in every
 * direction. Also owns the flat invisible plane that turns clicks into a lat/lon selection and
 * drags into panning.
 */
export function OceanSurface({ reducedMotion }: { reducedMotion: boolean }) {
  // Uniforms are mutated every frame (uTime) through the JSX ref, never through the props
  // object itself — the React Compiler lint treats hook-returned values as immutable.
  const [materialProps] = useState(() => waterMaterialProps());
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const waterRef = useRef<THREE.Mesh>(null);
  const setRegionSelection = useOceanStore((s) => s.setRegionSelection);

  const dragStart = useRef<THREE.Vector3 | null>(null);
  const dragMoved = useRef(false);
  const pinchInterrupted = useRef(false);

  useFrame((_, delta) => {
    const mat = materialRef.current;
    if (mat && !reducedMotion) mat.uniforms.uTime.value += delta;
    const water = waterRef.current;
    if (water) {
      water.position.x = Math.round(cameraRig.target.x / CELL) * CELL;
      water.position.z = Math.round(cameraRig.target.z / CELL) * CELL;
    }
  });

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    dragStart.current = event.point.clone();
    dragMoved.current = false;
    pinchInterrupted.current = false;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    const start = dragStart.current;
    // A second finger touching down means a pinch just started (WorldNavigator's own touch
    // listeners own zoom now) — stand down so the two gestures don't fight over the camera, and
    // remember it so the eventual pointerup doesn't read as a tap-to-select.
    if (inputState.multiTouch) pinchInterrupted.current = true;
    if (!start || event.buttons === 0 || inputState.multiTouch) return;
    // "Grab the ocean": keep the world point under the cursor fixed by shifting the rig target
    // by the opposite of the cursor's world-space movement. Only x/z — the plane is flat.
    const dx = event.point.x - start.x;
    const dz = event.point.z - start.z;
    if (!dragMoved.current && Math.hypot(dx, dz) > CLICK_DRAG_THRESHOLD) dragMoved.current = true;
    if (dragMoved.current) {
      cameraRig.target.x -= dx;
      cameraRig.target.z -= dz;
    }
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    const wasDrag = dragMoved.current || pinchInterrupted.current;
    dragStart.current = null;
    dragMoved.current = false;
    pinchInterrupted.current = false;
    if (wasDrag) return;
    event.stopPropagation();
    const { lat, lon } = worldToLatLon(event.point);
    setRegionSelection({ lat, lon, point: [event.point.x, 0, event.point.z] });
  };

  return (
    <group>
      <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE, PLANE_SEGMENTS, PLANE_SEGMENTS]} />
        <shaderMaterial ref={materialRef} {...materialProps} />
      </mesh>

      {/* Interaction plane: draws nothing (opacity 0, no depth write) but is the only thing the
          pointer raycasts against for the surface itself — clicks become lat/lon, drags pan. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
