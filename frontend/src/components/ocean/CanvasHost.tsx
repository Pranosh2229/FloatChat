"use client";

import { Canvas } from "@react-three/fiber";
import { Scene } from "./Scene";
import { useCoarsePointer } from "./useCoarsePointer";

interface CanvasHostProps {
  reducedMotion: boolean;
}

/**
 * The actual Three.js/R3F bundle, isolated in its own file so it can be dynamically
 * imported (code-split) and never ship in the initial page bundle. The camera's initial
 * transform is irrelevant — WorldNavigator places it from `cameraRig` on its first frame.
 */
export default function CanvasHost({ reducedMotion }: CanvasHostProps) {
  // A resolution cap, not a content change: same water shader, same tessellated land, same
  // instanced floats, same everything — just capped further below native device pixel ratio on
  // likely-weaker mobile GPUs, where rendering every pixel at dpr 2 is the actual bottleneck.
  const coarsePointer = useCoarsePointer();
  const dpr: [number, number] = coarsePointer ? [1, 1.5] : [1, 2];

  return (
    <Canvas
      camera={{ position: [0, 5, 4], fov: 45, near: 0.05, far: 400 }}
      dpr={dpr}
      gl={{ antialias: !coarsePointer, powerPreference: "high-performance" }}
      frameloop={reducedMotion ? "demand" : "always"}
    >
      <Scene reducedMotion={reducedMotion} />
    </Canvas>
  );
}
