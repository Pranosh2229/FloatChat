"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

import { WORLD_SCALE, latLonToWorld, worldToLatLon } from "./geo";
import { BANDS, applyRigToCamera, bandIndex, cameraRig, inputState, setNavigatorControls } from "./worldCamera";
import { curvatureUniforms } from "./worldCurvature";
import { useOceanStore } from "@/stores/oceanStore";

const BAND_TRANSITION_S = 1.1;
const FLY_TRANSITION_S = 1.4;
// How many bands higher than the more-zoomed-out of (current, destination) the pull-back phase
// rises to — enough to see both where you were and where you're headed, capped by BANDS' own
// top (goToBand clamps), never an arbitrary fixed altitude.
const CINEMATIC_PULLBACK_EXTRA_BANDS = 1;
// Tuned for a real Windows precision-touchpad two-finger scroll (small per-event deltaY, tens
// of events per swipe), not just a mouse wheel's one big ~100-120 notch — both still land in
// one step, but a trackpad swipe no longer needs to be unreasonably long to register at all.
const WHEEL_STEP_THRESHOLD = 45;
// A pinch gesture (two fingers apart/together on a trackpad) arrives as a wheel event with
// ctrlKey set — Chrome's own convention for "this is a zoom gesture, not a scroll." It's a
// deliberate two-finger motion, so it earns a lower bar to register as one step rather than
// needing several pinches.
const PINCH_STEP_THRESHOLD = 12;
// After a step fires, swallow wheel input for this long — a trackpad's inertial/momentum
// scrolling keeps sending events well after the fingers lift, and without this a single swipe
// could otherwise blow through two or three altitude bands instead of the one the user meant.
const WHEEL_COOLDOWN_MS = 350;
// A trackpad's horizontal two-finger swipe arrives as deltaX on the same wheel event — panned
// directly and continuously (not stepped like altitude), scaled by altitude the same way
// keyboard panning is so a swipe covers a similar fraction of the screen at every band.
const WHEEL_PAN_SENSITIVITY = 0.0035;
// Real two-finger touch pinch (phones/tablets — a completely different event stream from a
// trackpad's synthetic ctrlKey+wheel pinch above, since touchscreens have no wheel events at
// all). A 12% change in finger-to-finger distance reads as a deliberate pinch, same bar as the
// trackpad pinch; shares WHEEL_COOLDOWN_MS's cooldown so one continuous pinch steps once, not
// through several bands.
const TOUCH_PINCH_RATIO_THRESHOLD = 0.12;
const PAN_SPEED_PER_DISTANCE = 0.6; // world units/s per unit of camera distance
const BOUNDARY_PULL_PER_S = 2.5; // soft boundary: fraction of the overshoot recovered per second
const FOG_COLOR = "#cfd6cf"; // pale warm horizon — the far sea fades into the paper, not into black

interface Tween<T> {
  from: T;
  to: T;
  t: number;
  durationS: number;
}

type CinematicPhase = "pullback" | "arc" | "dive";
const CINEMATIC_PHASE_ORDER: CinematicPhase[] = ["pullback", "arc", "dive"];

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/**
 * Free-roam navigation for the continuous ocean world (REDESIGN_PLAN.md decision #3). Owns the
 * camera outright — no OrbitControls. Every frame it: applies keyboard pan velocity, advances any
 * running band/fly-to tween, pulls the target gently back inside the roamable bounds, positions
 * the camera from `cameraRig`, and scales the fog to the current altitude so the horizon fades
 * into the background rather than ending at a visible tile edge.
 *
 * Inputs: arrow keys / WASD pan; mouse wheel, laptop trackpad two-finger vertical scroll, or a
 * trackpad pinch gesture all step between altitude bands (one step per gesture, ignored
 * mid-transition and for a short cooldown after — trackpad inertial scrolling otherwise keeps
 * sending events well past when the fingers actually lifted); a trackpad's horizontal two-finger
 * swipe pans left/right directly and continuously, same axis as the arrow keys; F snaps to the
 * nearest real float and selects it; dragging the surface itself pans too (handled in
 * OceanSurface, which writes to the same rig target).
 *
 * A resolved Ask answer (`flyToTarget.cinematic`, REDESIGN_PLAN.md decision #8) doesn't just jump
 * — it runs a 3-beat move: pull back for context, arc over to the destination while pulled back,
 * then dive to the destination's own band. Any genuine manual input cancels it mid-flight.
 */
export function WorldNavigator({ reducedMotion }: { reducedMotion: boolean }) {
  const gl = useThree((state) => state.gl);
  const floats = useOceanStore((s) => s.floats);
  const selectFloat = useOceanStore((s) => s.selectFloat);
  const flyToTarget = useOceanStore((s) => s.flyToTarget);
  const clearFlyToTarget = useOceanStore((s) => s.clearFlyToTarget);
  const setAltitudeBand = useOceanStore((s) => s.setAltitudeBand);
  const pushView = useOceanStore((s) => s.pushView);

  const keys = useRef(new Set<string>());
  const velocity = useRef(new THREE.Vector2());
  const bandTween = useRef<Tween<{ distance: number; tiltDeg: number }> | null>(null);
  const targetTween = useRef<Tween<THREE.Vector3> | null>(null);
  const wheelAccumulator = useRef(0);
  const wheelCooldownUntil = useRef(0);
  const pinchStartDistance = useRef<number | null>(null);
  const floatsRef = useRef(floats);
  // 3-beat cinematic camera move for resolved Ask answers (REDESIGN_PLAN.md decision #8):
  // pull back for context, arc to the region while pulled back, dive to the destination band.
  // `cinematicPhase` is the beat currently in flight; `cinematicDestination` is where it's
  // ultimately headed. Both null outside of (or once past) a cinematic sequence.
  const cinematicPhase = useRef<CinematicPhase | null>(null);
  const cinematicDestination = useRef<{ point: THREE.Vector3; band: number } | null>(null);

  useEffect(() => {
    floatsRef.current = floats;
  }, [floats]);

  const goToBand = (index: number) => {
    const clamped = THREE.MathUtils.clamp(index, 0, BANDS.length - 1);
    if (clamped === cameraRig.band && !bandTween.current) return;
    cameraRig.band = clamped;
    setAltitudeBand(clamped);
    const band = BANDS[clamped];
    bandTween.current = {
      from: { distance: cameraRig.distance, tiltDeg: cameraRig.tiltDeg },
      to: { distance: band.distance, tiltDeg: band.tiltDeg },
      t: 0,
      durationS: reducedMotion ? 0.01 : BAND_TRANSITION_S,
    };
  };

  const flyTo = (point: THREE.Vector3, band?: number) => {
    const to = point.clone().setY(0);
    targetTween.current = {
      from: cameraRig.target.clone(),
      to,
      t: 0,
      durationS: reducedMotion ? 0.01 : FLY_TRANSITION_S,
    };
    velocity.current.set(0, 0);
    if (band !== undefined) goToBand(band);
  };

  // Any genuine manual input (pan, zoom, nearest-float, whole-ocean) takes over from an
  // in-progress cinematic sequence — called at those input sites, never from inside
  // goToBand/flyTo themselves, since the cinematic sequence below drives itself through those
  // same two functions and would otherwise cancel its own next beat.
  const cancelCinematic = () => {
    cinematicPhase.current = null;
    cinematicDestination.current = null;
  };

  // Runs the next beat of the cinematic sequence (or ends it once "dive" completes). If a beat's
  // own action turns out to be a no-op — goToBand/flyTo early-return when already there — this
  // recurses immediately rather than waiting a frame for a tween that was never started.
  const advanceCinematic = () => {
    const destination = cinematicDestination.current;
    if (!destination) {
      cinematicPhase.current = null;
      return;
    }
    const currentIndex = cinematicPhase.current
      ? CINEMATIC_PHASE_ORDER.indexOf(cinematicPhase.current)
      : -1;
    const nextPhase = CINEMATIC_PHASE_ORDER[currentIndex + 1];
    if (!nextPhase) {
      cinematicPhase.current = null;
      cinematicDestination.current = null;
      return;
    }
    cinematicPhase.current = nextPhase;
    if (nextPhase === "pullback") {
      const pullbackBand = Math.min(
        BANDS.length - 1,
        Math.max(cameraRig.band, destination.band) + CINEMATIC_PULLBACK_EXTRA_BANDS,
      );
      goToBand(pullbackBand);
    } else if (nextPhase === "arc") {
      flyTo(destination.point);
    } else {
      goToBand(destination.band);
    }
    if (!bandTween.current && !targetTween.current) advanceCinematic();
  };

  const startCinematicFlyTo = (point: THREE.Vector3, band: number) => {
    cinematicDestination.current = { point: point.clone().setY(0), band };
    cinematicPhase.current = null;
    advanceCinematic();
  };

  const snapToNearestFloat = () => {
    const list = floatsRef.current;
    if (list.length === 0) return;
    let best = list[0];
    let bestDistance = Infinity;
    for (const f of list) {
      const p = latLonToWorld(f.latest_lat, f.latest_lon);
      const d = p.distanceToSquared(cameraRig.target);
      if (d < bestDistance) {
        bestDistance = d;
        best = f;
      }
    }
    flyTo(latLonToWorld(best.latest_lat, best.latest_lon), bandIndex("floats"));
    selectFloat(best);
  };

  // On-screen controls (WorldControls.tsx) drive the same primitives as the keyboard.
  useEffect(() => {
    setNavigatorControls({
      pan: (key, pressed) => {
        if (pressed) {
          keys.current.add(key);
          targetTween.current = null;
          cancelCinematic();
        } else keys.current.delete(key);
      },
      zoom: (step) => {
        cancelCinematic();
        goToBand(cameraRig.band + step);
      },
      nearestFloat: () => {
        cancelCinematic();
        snapToNearestFloat();
      },
      wholeOcean: () => {
        cancelCinematic();
        flyTo(new THREE.Vector3(cameraRig.target.x, 0, 0), bandIndex("world"));
      },
    });
    return () => setNavigatorControls(null);
    // Closures over refs + stable helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store-driven fly-to (Ask answers, Discovery cards, comparisons). Consumed immediately — the
  // animation lives in a ref, so scrubbing it never re-renders anything.
  useEffect(() => {
    if (!flyToTarget) return;
    cancelCinematic(); // a new store-driven fly always takes over from any prior one in flight
    if (!flyToTarget.restoring) {
      // Remember where the user *was* so Back can take them there (not for Back's own move).
      const { lat, lon } = worldToLatLon(cameraRig.target);
      pushView({ lat, lon, band: BANDS[cameraRig.band].key });
    }
    const band = bandIndex(flyToTarget.band ?? "region");
    const point = latLonToWorld(flyToTarget.lat, flyToTarget.lon);
    if (flyToTarget.cinematic) {
      startCinematicFlyTo(point, band);
    } else {
      flyTo(point, band);
    }
    clearFlyToTarget();
    // flyTo/goToBand close over stable refs; listing them would recreate the effect needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToTarget, clearFlyToTarget, pushView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        keys.current.add(key);
        event.preventDefault();
        // Any manual pan cancels an in-flight fly-to — the user has taken the wheel.
        targetTween.current = null;
        cancelCinematic();
      } else if (key === "f") {
        cancelCinematic();
        snapToNearestFloat();
      } else if (key === "+" || key === "=") {
        cancelCinematic();
        goToBand(cameraRig.band - 1);
      } else if (key === "-" || key === "_") {
        cancelCinematic();
        goToBand(cameraRig.band + 1);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
    };
    const onBlur = () => keys.current.clear();
    const onWheel = (event: WheelEvent) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();

      // Horizontal component (a trackpad's left/right two-finger swipe, or a mouse with a tilt
      // wheel) pans directly and continuously — not stepped like altitude, since "how far" is
      // exactly what the swipe distance already tells us. Scaled by altitude, same as keyboard
      // panning, and it takes over from any in-flight fly-to the same way a keypress does.
      if (event.deltaX !== 0) {
        targetTween.current = null;
        cancelCinematic();
        cameraRig.target.x += event.deltaX * WHEEL_PAN_SENSITIVITY * cameraRig.distance;
      }

      // Vertical component (mouse wheel notch, trackpad two-finger scroll, or — with ctrlKey —
      // a trackpad pinch) steps between altitude bands instead, same as before.
      if (bandTween.current || performance.now() < wheelCooldownUntil.current) return;
      wheelAccumulator.current += event.deltaY;
      const threshold = event.ctrlKey ? PINCH_STEP_THRESHOLD : WHEEL_STEP_THRESHOLD;
      if (Math.abs(wheelAccumulator.current) >= threshold) {
        cancelCinematic();
        goToBand(cameraRig.band + (wheelAccumulator.current > 0 ? 1 : -1));
        wheelAccumulator.current = 0;
        wheelCooldownUntil.current = performance.now() + WHEEL_COOLDOWN_MS;
      }
    };

    // Real two-finger touch pinch (phones/tablets) — single-finger drag-to-pan already works via
    // OceanSurface's Pointer Events (the browser unifies touch into those automatically), but a
    // pinch gesture has no wheel-event equivalent on a touchscreen and needs its own listeners.
    const touchDistance = (touches: TouchList): number => {
      const [a, b] = [touches[0], touches[1]];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      inputState.multiTouch = true; // tells OceanSurface's single-finger pan to stand down
      pinchStartDistance.current = touchDistance(event.touches);
      cancelCinematic();
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length < 2 || pinchStartDistance.current === null) return;
      event.preventDefault(); // don't let the browser also pinch-zoom the whole page
      if (bandTween.current || performance.now() < wheelCooldownUntil.current) return;
      const current = touchDistance(event.touches);
      const ratio = current / pinchStartDistance.current;
      if (Math.abs(ratio - 1) >= TOUCH_PINCH_RATIO_THRESHOLD) {
        cancelCinematic();
        goToBand(cameraRig.band + (ratio > 1 ? -1 : 1)); // fingers apart = zoom in, together = out
        pinchStartDistance.current = current; // re-baseline so one pinch steps once, not several
        wheelCooldownUntil.current = performance.now() + WHEEL_COOLDOWN_MS;
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      inputState.multiTouch = false;
      pinchStartDistance.current = null;
    };

    const canvas = gl.domElement;
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      inputState.multiTouch = false;
    };
    // Handlers close over refs and stable store actions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, reducedMotion]);

  // Camera and scene are taken from the frame state, not `useThree()`: R3F's per-frame
  // mutation of the camera is the intended pattern, but the React Compiler lint treats
  // hook-returned objects as immutable.
  useFrame(({ camera, scene }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05); // don't lurch after a tab switch

    // 1. Keyboard pan: velocity eases toward the input direction, scaled by altitude so a
    //    keypress covers a similar fraction of the screen at every band.
    const k = keys.current;
    const input = new THREE.Vector2(
      (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0),
      (k.has("arrowdown") || k.has("s") ? 1 : 0) - (k.has("arrowup") || k.has("w") ? 1 : 0),
    );
    if (input.lengthSq() > 0) input.normalize();
    const speed = cameraRig.distance * PAN_SPEED_PER_DISTANCE;
    velocity.current.lerp(input.multiplyScalar(speed), 1 - Math.exp(-8 * delta));
    cameraRig.target.x += velocity.current.x * delta;
    cameraRig.target.z += velocity.current.y * delta;

    // 2. Fly-to tween (overrides the pan while running).
    const tt = targetTween.current;
    if (tt) {
      tt.t = Math.min(1, tt.t + delta / tt.durationS);
      cameraRig.target.lerpVectors(tt.from, tt.to, easeInOutCubic(tt.t));
      if (tt.t >= 1) targetTween.current = null;
    }

    // 3. Band tween.
    const bt = bandTween.current;
    if (bt) {
      bt.t = Math.min(1, bt.t + delta / bt.durationS);
      const e = easeInOutCubic(bt.t);
      cameraRig.distance = THREE.MathUtils.lerp(bt.from.distance, bt.to.distance, e);
      cameraRig.tiltDeg = THREE.MathUtils.lerp(bt.from.tiltDeg, bt.to.tiltDeg, e);
      if (bt.t >= 1) bandTween.current = null;
    }

    // 3.5 Cinematic sequence: once the current beat's tween(s) have both finished, move on to
    //     the next one (pullback -> arc -> dive), or end the sequence after dive.
    if (cinematicPhase.current && !targetTween.current && !bandTween.current) {
      advanceCinematic();
    }

    // 4. The edges of the world are a soft stop, not a wall: you can see all of the Arctic,
    //    Antarctica and both ends of the map, but the target eases back once it would carry the
    //    view past them (limits per band, see worldCamera.ts).
    if (!targetTween.current) {
      const pull = 1 - Math.exp(-BOUNDARY_PULL_PER_S * delta);
      const band = BANDS[cameraRig.band];
      const maxZ = band.maxLat * WORLD_SCALE;
      const maxX = band.maxLon * WORLD_SCALE;
      const cz = THREE.MathUtils.clamp(cameraRig.target.z, -maxZ, maxZ);
      const cx = THREE.MathUtils.clamp(cameraRig.target.x, -maxX, maxX);
      cameraRig.target.z += (cz - cameraRig.target.z) * pull;
      cameraRig.target.x += (cx - cameraRig.target.x) * pull;
    }

    applyRigToCamera(camera);
    curvatureUniforms.uCurveCenter.value.set(cameraRig.target.x, cameraRig.target.z);

    // 5. Fog tracks altitude: close-in at the surface (you're "in" the water), far at the top.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = cameraRig.distance * 1.4;
      scene.fog.far = cameraRig.distance * 4.2;
    }
  });

  return (
    <>
      <color attach="background" args={[FOG_COLOR]} />
      <fog attach="fog" args={[FOG_COLOR, 1, 10]} />
    </>
  );
}
