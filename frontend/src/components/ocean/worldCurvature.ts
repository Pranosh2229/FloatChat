import * as THREE from "three";

/**
 * "Curved world" bend (the user's ask: edges that fall away like a turning globe, without
 * actually being a globe). Every vertex is dropped by strength·d² where d is its horizontal
 * distance from the camera target, so the surface near you is flat and the far edges curve
 * down and away. Applied in the vertex stage of *every* material in the world — water, land,
 * coastlines, floats, markers — by sharing these uniform objects, so one update per frame
 * (WorldNavigator sets `uCurveCenter`) bends everything consistently.
 */
export const curvatureUniforms = {
  uCurveCenter: { value: new THREE.Vector2(0, 0) },
  uCurveStrength: { value: 0.011 },
};

const BEND_GLSL = /* glsl */ `
  vec4 fcWorld = modelMatrix * mvPosition;
  float fcDx = fcWorld.x - uCurveCenter.x;
  float fcDz = fcWorld.z - uCurveCenter.y;
  fcWorld.y -= uCurveStrength * (fcDx * fcDx + fcDz * fcDz);
  mvPosition = viewMatrix * fcWorld;
  gl_Position = projectionMatrix * mvPosition;
`;

// Replaces three's own <project_vertex> chunk: same instancing handling, then the bend.
const PROJECT_VERTEX_BENT = /* glsl */ `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    mvPosition = batchingMatrix * mvPosition;
  #endif
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  ${BEND_GLSL}
`;

/**
 * Patches a built-in three material so its vertices follow the world curvature. Safe to use as
 * a JSX ref callback (`<meshBasicMaterial ref={bendMaterial} />`) or on materials built in code.
 */
export function bendMaterial(material: THREE.Material | null): void {
  if (!material || (material as { userData: { bent?: boolean } }).userData.bent) return;
  material.userData.bent = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCurveCenter = curvatureUniforms.uCurveCenter;
    shader.uniforms.uCurveStrength = curvatureUniforms.uCurveStrength;
    shader.vertexShader =
      "uniform vec2 uCurveCenter;\nuniform float uCurveStrength;\n" +
      shader.vertexShader.replace("#include <project_vertex>", PROJECT_VERTEX_BENT);
  };
  // A patched shader is a different program — make sure three recompiles.
  material.customProgramCacheKey = () => "floatchat-bent";
  material.needsUpdate = true;
}

/** CPU-side version for things positioned in JS (drei Html labels, group offsets). */
export function curvatureDrop(x: number, z: number): number {
  const dx = x - curvatureUniforms.uCurveCenter.value.x;
  const dz = z - curvatureUniforms.uCurveCenter.value.y;
  return curvatureUniforms.uCurveStrength.value * (dx * dx + dz * dz);
}

/** The same bend for hand-written shaders (see waterShader.ts): declare the uniforms and call
 * `bendWorld(world)` on a world-space position. */
export const CURVATURE_GLSL = /* glsl */ `
  uniform vec2 uCurveCenter;
  uniform float uCurveStrength;
  vec4 bendWorld(vec4 world) {
    float dx = world.x - uCurveCenter.x;
    float dz = world.z - uCurveCenter.y;
    world.y -= uCurveStrength * (dx * dx + dz * dz);
    return world;
  }
`;
