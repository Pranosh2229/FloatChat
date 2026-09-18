"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Instance, Instances } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { FloatSummary } from "@/lib/api";
import { useOceanStore } from "@/stores/oceanStore";
import { latLonToWorld } from "./geo";
import { cameraRig } from "./worldCamera";
import { buildArgoFloatParts } from "./argoFloatParts";
import { bendMaterial } from "./worldCurvature";
import { getWorldPalette } from "./worldTheme";

interface Placement {
  float: FloatSummary;
  position: THREE.Vector3;
}

const TIME_WINDOW_MS = 15 * 24 * 60 * 60 * 1000; // ±15 days reads as "active around now"

/** Floats are ~0.15 world units tall — the right size at float level, invisible from the
 * "whole ocean" band. Like map pins, they grow with camera distance beyond this so they stay
 * legible as markers at every altitude (the visual-data rule: you should always see *where*). */
const MARKER_SCALE_DISTANCE = 3;
const MARKER_SCALE_MAX = 6;

function altitudeScale(): number {
  return THREE.MathUtils.clamp(cameraRig.distance / MARKER_SCALE_DISTANCE, 1, MARKER_SCALE_MAX);
}

interface SelectionGlowProps {
  position: THREE.Vector3;
  reducedMotion: boolean;
  color?: string;
  radius?: [number, number];
}

/** A pulsing ring at the base of a float — the model is already yellow (its real color), so
 * selection/highlight is shown as a separate indicator rather than a color swap. Reused for both
 * the click-selected float (cyan) and floats a query answer surfaced (amber, Part 10). */
function SelectionGlow({
  position,
  reducedMotion,
  color = "#1d4ed8",
  radius = [0.02, 0.026],
}: SelectionGlowProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.scale.setScalar(altitudeScale());
  });
  return (
    <group ref={ref} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[radius[0], radius[1], 32]} />
        <meshBasicMaterial
          ref={bendMaterial}
          color={color}
          toneMapped={false}
          transparent
          opacity={reducedMotion ? 0.8 : 0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/**
 * Real ARGO floats rendered as a from-scratch procedural model (see argoFloatParts.ts) — one
 * InstancedMesh draw call per part (~6 total) regardless of float count. Reads floats/selection
 * from the centralized ocean store rather than props; scales down floats with no observation
 * near the scrubbed timeline position (the "moving the timeline updates float highlighting"
 * requirement — implemented via per-instance scale, since InstancedMesh has no built-in
 * per-instance opacity attribute without a custom shader).
 */
export function FloatLayer({ reducedMotion }: { reducedMotion: boolean }) {
  const floats = useOceanStore((s) => s.floats);
  const loadFloats = useOceanStore((s) => s.loadFloats);
  const selectedFloatId = useOceanStore((s) => s.selectedFloatId);
  const selectFloat = useOceanStore((s) => s.selectFloat);
  const currentTime = useOceanStore((s) => s.currentTime);
  const highlightedFloatIds = useOceanStore((s) => s.highlightedFloatIds);
  const primaryFloatId = useOceanStore((s) => s.primaryFloatId);
  const discoveryEvents = useOceanStore((s) => s.discoveryEvents);
  const theme = useOceanStore((s) => s.theme);
  const gl = useThree((state) => state.gl);
  const palette = getWorldPalette(theme);

  const parts = useMemo(() => {
    const built = buildArgoFloatParts();
    for (const part of Object.values(built)) bendMaterial(part.material);
    return built;
  }, []);
  const instanceRefs = useRef<Map<string, THREE.Object3D | null>>(new Map());
  const [hoveredFloatId, setHoveredFloatId] = useState<number | null>(null);

  // Real detected events, not a guess — a float only gets the idle pulse if it genuinely shows
  // up in at least one of the events already surfaced as case files.
  const eventFloatIds = useMemo(
    () => new Set(discoveryEvents.flatMap((e) => e.affected_float_ids)),
    [discoveryEvents],
  );

  useEffect(() => {
    loadFloats();
  }, [loadFloats]);

  const placements: Placement[] = useMemo(
    () =>
      floats.map((float) => ({
        float,
        position: latLonToWorld(float.latest_lat, float.latest_lon),
      })),
    [floats],
  );

  // Apply the timeline-driven scale imperatively in useFrame — reading a fast-changing value
  // (currentTime, updated continuously while scrubbing) through React state/props on every
  // instance would re-render the whole layer every frame, exactly what useFrame/refs exist to
  // avoid (see the immersive-3d-web/r3f-drei guidance: continuous values via useFrame, not
  // useState). The altitude factor is read the same way: cameraRig changes every frame.
  useFrame(() => {
    const currentMs = currentTime.getTime();
    const altitude = altitudeScale();
    for (const { float } of placements) {
      const observedMs = new Date(float.latest_time).getTime();
      const inWindow = Math.abs(observedMs - currentMs) <= TIME_WINDOW_MS;
      const isSelected = float.id === selectedFloatId;
      const isPrimary = float.id === primaryFloatId;
      const isHighlighted = highlightedFloatIds.includes(float.id);
      const targetScale =
        (isSelected ? 1.7 : isPrimary ? 1.55 : isHighlighted ? 1.3 : inWindow ? 1 : 0.4) * altitude;
      for (const key of Object.keys(parts)) {
        const obj = instanceRefs.current.get(`${key}:${float.id}`);
        if (obj && Math.abs(obj.scale.x - targetScale) > 0.001) {
          obj.scale.setScalar(targetScale);
        }
      }
    }
  });

  if (placements.length === 0) return null;

  const selected = placements.find((p) => p.float.id === selectedFloatId);
  // Relevance-ranked highlighting: among everything an answer highlights, the one real float
  // that actually drove the anomaly most strongly (backend `Event.primary_float_id`) reads as
  // visually primary — the rest are still marked, just more quietly.
  const primary =
    primaryFloatId !== null && primaryFloatId !== selectedFloatId
      ? placements.find((p) => p.float.id === primaryFloatId)
      : undefined;
  const highlighted = placements.filter(
    (p) =>
      highlightedFloatIds.includes(p.float.id) &&
      p.float.id !== selectedFloatId &&
      p.float.id !== primaryFloatId,
  );
  const hovered =
    hoveredFloatId !== null && hoveredFloatId !== selectedFloatId
      ? placements.find((p) => p.float.id === hoveredFloatId)
      : undefined;
  const idlePulseTargets = placements.filter(
    (p) =>
      eventFloatIds.has(p.float.id) &&
      p.float.id !== selectedFloatId &&
      !highlightedFloatIds.includes(p.float.id),
  );

  return (
    <group>
      {Object.entries(parts).map(([key, part]) => (
        <Instances
          key={key}
          geometry={part.geometry}
          material={part.material}
          limit={placements.length}
          range={placements.length}
        >
          {placements.map(({ float, position }) => (
            <Instance
              key={float.id}
              ref={(obj: THREE.Object3D | null) => {
                instanceRefs.current.set(`${key}:${float.id}`, obj);
              }}
              position={position}
              onClick={(event) => {
                event.stopPropagation();
                selectFloat(float);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredFloatId(float.id);
                gl.domElement.style.cursor = "pointer";
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                setHoveredFloatId((current) => (current === float.id ? null : current));
                gl.domElement.style.cursor = "auto";
              }}
            />
          ))}
        </Instances>
      ))}
      {selected && (
        <SelectionGlow position={selected.position} reducedMotion={reducedMotion} color={palette.marker.cobalt} />
      )}
      {primary && <PrimaryGlow position={primary.position} reducedMotion={reducedMotion} />}
      {highlighted.map(({ float, position }) => (
        <SelectionGlow
          key={float.id}
          position={position}
          reducedMotion={reducedMotion}
          color="#f0562f"
          radius={[0.016, 0.02]}
        />
      ))}
      {hovered && (
        <SelectionGlow
          position={hovered.position}
          reducedMotion={reducedMotion}
          color={palette.marker.glow}
          radius={[0.022, 0.027]}
        />
      )}
      {!reducedMotion &&
        idlePulseTargets.map(({ float, position }) => (
          <IdlePulseGlow key={float.id} position={position} />
        ))}
    </group>
  );
}

/** The relevance-ranked highlight: a wider coral ring plus an inner gold ring, so the one float
 * that actually drove an anomaly most strongly reads as clearly more important than the other
 * floats an answer merely also mentions (which just get the plain, thinner `SelectionGlow`). */
function PrimaryGlow({ position, reducedMotion }: { position: THREE.Vector3; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    ref.current?.scale.setScalar(altitudeScale());
  });
  return (
    <group ref={ref} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.026, 0.033, 32]} />
        <meshBasicMaterial
          ref={bendMaterial}
          color="#f0562f"
          toneMapped={false}
          transparent
          opacity={reducedMotion ? 0.85 : 0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.051, 0]}>
        <ringGeometry args={[0.015, 0.019, 32]} />
        <meshBasicMaterial ref={bendMaterial} color="#f4c95d" toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** A slow, always-on breathing ring — the interaction indicator for a float tied to a real
 * detected event, so it reads as "worth a look" before the user has clicked or asked anything
 * (REDESIGN_PLAN.md decision #4). Coral, same as every other anomaly-linked accent, just fainter
 * and animated rather than a flat highlight. */
function IdlePulseGlow({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    ref.current?.scale.setScalar(altitudeScale());
    const mat = materialRef.current;
    if (mat) mat.opacity = 0.28 + 0.22 * (0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 1.6));
  });
  return (
    <group ref={ref} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <ringGeometry args={[0.028, 0.032, 32]} />
        <meshBasicMaterial
          ref={(m) => {
            materialRef.current = m;
            bendMaterial(m);
          }}
          color="#f0562f"
          toneMapped={false}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
