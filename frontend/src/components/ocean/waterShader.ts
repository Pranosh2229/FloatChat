import * as THREE from "three";

import { CURVATURE_GLSL, curvatureUniforms } from "./worldCurvature";

/**
 * Procedural ocean surface (replaces the tiled GLB from the first Phase 1 pass, which read as
 * "square plots" — see REDESIGN_PLAN.md). One continuous plane: the vertex shader stacks four
 * Gerstner-style swells in *world* space so the surface is seamless no matter where the plane
 * is moved to; the fragment shader adds fine ripple normals, a fresnel blend from deep ink
 * (looking down) to a pale horizon (grazing), and a tight gold sun glint. Colours follow the
 * Field Notebook palette.
 */

export const WATER_COLORS = {
  deep: new THREE.Color("#0b2f3a"),
  lit: new THREE.Color("#1b5e6b"),
  horizon: new THREE.Color("#c9d1c9"),
  glint: new THREE.Color("#f4c95d"),
};

export const SUN_DIRECTION = new THREE.Vector3(0.45, 0.55, -0.7).normalize();

export const waterVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  #include <fog_pars_vertex>
  ${CURVATURE_GLSL}

  // Four swells: (dir.x, dir.z, wavelength, amplitude). World units; a float is ~0.15 tall.
  const vec4 W0 = vec4( 0.80,  0.60, 1.30, 0.022);
  const vec4 W1 = vec4(-0.55,  0.83, 0.62, 0.012);
  const vec4 W2 = vec4( 0.20, -0.98, 0.31, 0.006);
  const vec4 W3 = vec4(-0.95, -0.30, 0.15, 0.003);

  float wave(vec4 w, vec2 p, float t) {
    float k = 6.28318 / w.z;
    float c = sqrt(9.8 / k) * 0.35; // stylised deep-water speed, slowed for calm swell
    return w.w * sin(dot(normalize(w.xy), p) * k + t * c * k);
  }

  float height(vec2 p, float t) {
    return wave(W0, p, t) + wave(W1, p, t) + wave(W2, p, t) + wave(W3, p, t);
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 p = world.xz;
    float h = height(p, uTime);
    float e = 0.02;
    float hx = height(p + vec2(e, 0.0), uTime);
    float hz = height(p + vec2(0.0, e), uTime);
    world.y += h;
    vNormal = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
    vWorldPos = world.xyz;
    vec4 mvPosition = viewMatrix * bendWorld(world);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const waterFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uLit;
  uniform vec3 uHorizon;
  uniform vec3 uGlint;
  uniform vec3 uSunDir;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  #include <fog_pars_fragment>

  // Cheap fine-scale ripple normal: two crossed sine bands, faded out with distance so the
  // far surface doesn't shimmer/alias from the top band.
  vec3 ripple(vec2 p, float t, float fade) {
    float a = sin(p.x * 52.0 + p.y * 31.0 + t * 1.7) * 0.012;
    float b = sin(p.x * 23.0 - p.y * 61.0 - t * 1.3) * 0.010;
    return vec3(a, 0.0, b) * fade;
  }

  // Large-scale, purely spatial colour variation — no time term, so this is texture, not new
  // motion. Where "flatten" (below) has already smoothed away the fine ripple normals for
  // distant water, this gives the sea some breadth instead of reading as one flat tint; it is
  // gated by that same "flatten" value too, so nearby water is completely unaffected.
  float colorVariation(vec2 p) {
    float a = sin(p.x * 0.35 + p.y * 0.22);
    float b = sin(p.x * -0.18 + p.y * 0.41 + 1.7);
    return (a + b) * 0.5;
  }

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float dist = length(cameraPosition - vWorldPos);
    float fade = clamp(1.0 - dist / 9.0, 0.0, 1.0);
    // Where the swell is smaller than a pixel its normals alias into a hatched glare. Measure
    // how fast the normal changes per screen pixel (fwidth) and only there blend toward flat —
    // nearby swell keeps its full shape, the far surface settles into a calm sheen.
    float aliasing = length(fwidth(vNormal));
    float flatten = clamp(aliasing * 7.0 - 0.05, 0.0, 0.9);
    vec3 n = normalize(mix(vNormal + ripple(vWorldPos.xz, uTime, fade), vec3(0.0, 1.0, 0.0), flatten));

    // Fresnel: straight down you see into the ink; at a grazing angle you see the pale sky.
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

    float diffuse = max(dot(n, uSunDir), 0.0);
    vec3 body = mix(uDeep, uLit, diffuse * 0.85);
    // Only where the surface has already flattened (distant/zoomed-out water) — a subtle tint
    // shift so it reads as open sea with some breadth, not a single flat colour.
    body *= 1.0 + colorVariation(vWorldPos.xz) * 0.06 * flatten;
    vec3 color = mix(body, uHorizon, fresnel * 0.75);

    // Sun glint: tight Blinn-Phong lobe in gold, strongest where ripples catch the sun.
    vec3 h = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, h), 0.0), mix(160.0, 40.0, flatten));
    color += uGlint * spec * mix(1.4, 0.35, flatten);
    // A wider, softer sheen so the lit side of every swell reads as water, not plastic.
    color += uGlint * pow(max(dot(n, h), 0.0), 18.0) * 0.08;

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
    #include <colorspace_fragment>
  }
`;

/** Props for an R3F `<shaderMaterial>` — built fresh per call so each mesh owns its uniforms. */
export function waterMaterialProps() {
  const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: WATER_COLORS.deep },
        uLit: { value: WATER_COLORS.lit },
        uHorizon: { value: WATER_COLORS.horizon },
        uGlint: { value: WATER_COLORS.glint },
        uSunDir: { value: SUN_DIRECTION },
      },
  ]);
  // Shared objects (not merged copies) so WorldNavigator's per-frame update reaches this too.
  uniforms.uCurveCenter = curvatureUniforms.uCurveCenter;
  uniforms.uCurveStrength = curvatureUniforms.uCurveStrength;
  return {
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    uniforms,
    fog: true,
  };
}
