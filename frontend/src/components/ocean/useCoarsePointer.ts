import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

/**
 * True when the primary pointing input is touch/coarse (phones, most tablets) rather than a
 * mouse/trackpad. Used only to pick a lighter render resolution for likely-weaker mobile GPUs
 * (`CanvasHost`'s `dpr` cap) — never to change what's drawn, an animation, or a 3D asset.
 * Reactive (unlike `useHasWebGL.ts`'s one-time WebGL probe) because a 2-in-1 device can
 * genuinely switch pointer types mid-session. `getServerSnapshot` returns `false` so SSR/
 * prerender never touches `window`.
 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
