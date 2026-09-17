"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useReducedMotion } from "motion/react";

import { OceanPoster } from "./OceanPoster";
import { useHasWebGL } from "./useHasWebGL";

// Code-split: the Three.js/R3F bundle never ships in the initial page load.
const CanvasHost = dynamic(() => import("./CanvasHost"), { ssr: false });

/**
 * The persistent ocean world. A real `<img>`-equivalent (inline SVG) poster is the LCP element
 * and paints immediately; the WebGL scene mounts after, only when supported and motion is
 * allowed. Reduced-motion and no-WebGL visitors get the poster and nothing else — never a
 * blank box.
 */
export function OceanWorld() {
  const reducedMotion = useReducedMotion();
  const webglSupported = useHasWebGL();

  // Reserve the box immediately (no CLS) regardless of which branch renders inside it.
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#cfd6cf]">
      <div className="absolute inset-0">
        <OceanPoster />
      </div>
      {webglSupported && reducedMotion === false && (
        <Suspense fallback={null}>
          <div className="absolute inset-0">
            <CanvasHost reducedMotion={!!reducedMotion} />
          </div>
        </Suspense>
      )}
    </div>
  );
}
