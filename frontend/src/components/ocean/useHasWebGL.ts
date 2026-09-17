import { useSyncExternalStore } from "react";

// WebGL support never changes during a session — probe once, cache the result.
let cached: boolean | null = null;

function probe(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement("canvas");
    cached = !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    cached = false;
  }
  return cached;
}

// Nothing to subscribe to — the capability is static for the life of the page.
const subscribe = () => () => {};

/**
 * Reads WebGL support as external (non-React) state via `useSyncExternalStore` — the
 * React-correct tool for this, rather than a synchronous `setState` inside a `useEffect`.
 * `getServerSnapshot` returns `false` so SSR/prerender never touches `document`.
 */
export function useHasWebGL(): boolean {
  return useSyncExternalStore(subscribe, probe, () => false);
}
