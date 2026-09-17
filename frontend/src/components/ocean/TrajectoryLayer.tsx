"use client";

import { useMemo } from "react";
import { Instance, Instances } from "@react-three/drei";

import { useOceanStore } from "@/stores/oceanStore";
import { latLonToWorld } from "./geo";
import { bendMaterial } from "./worldCurvature";

// Just above the animated wave surface so the path isn't swallowed by crests.
const PATH_HEIGHT = 0.06;

/**
 * A selected float's real journey: a thin connecting path (plain THREE.Line — drei's fat-line
 * `<Line>` renders unreliably in this R3F/drei/three version combination, confirmed by direct
 * testing) plus a small waypoint dot at every real profile position. Both are filtered to
 * "up to the current timeline position" — a time-aware path (spec §11.4), not the whole
 * journey rendered at once regardless of where the timeline is scrubbed to.
 */
export function TrajectoryLayer() {
  const trajectory = useOceanStore((s) => s.trajectory);
  const currentTime = useOceanStore((s) => s.currentTime);

  const waypoints = useMemo(() => {
    if (!trajectory) return null;
    const currentMs = currentTime.getTime();
    const visible = trajectory.points.filter((p) => new Date(p.timestamp).getTime() <= currentMs);
    if (visible.length === 0) return null;
    return visible.map((p) => latLonToWorld(p.latitude, p.longitude, PATH_HEIGHT));
  }, [trajectory, currentTime]);

  const linePositions = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return null;
    const array = new Float32Array(waypoints.length * 3);
    waypoints.forEach((v, i) => {
      array[i * 3] = v.x;
      array[i * 3 + 1] = v.y;
      array[i * 3 + 2] = v.z;
    });
    return array;
  }, [waypoints]);

  if (!waypoints) return null;

  return (
    <>
      {linePositions && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial ref={bendMaterial} color="#1d4ed8" transparent opacity={0.9} toneMapped={false} />
        </line>
      )}
      <Instances limit={waypoints.length} range={waypoints.length}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial ref={bendMaterial} color="#1d4ed8" toneMapped={false} />
        {waypoints.map((position, i) => (
          <Instance key={i} position={position} />
        ))}
      </Instances>
    </>
  );
}
