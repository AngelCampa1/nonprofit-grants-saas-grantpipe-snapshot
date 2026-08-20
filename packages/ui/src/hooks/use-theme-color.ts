import { useSyncExternalStore } from "react";

/**
 * Reads a CSS custom property from the document root and returns it.
 *
 * Intended for scenarios where a non-CSS consumer (e.g. Recharts SVG attributes
 * set on individual props) needs the computed value of a theme variable. Uses
 * useSyncExternalStore to avoid setState-in-effect cascades; the value is
 * snapshotted on every render (and the server snapshot returns the fallback).
 */
export function useThemeColor(varName: string, fallback: string): string {
  return useSyncExternalStore(
    subscribeNoop,
    () => readCssVarValue(varName, fallback),
    () => fallback,
  );
}

function subscribeNoop(): () => void {
  // GrantPipe ships a single light theme, so the CSS variable value is fixed at
  // runtime. There is nothing to subscribe to — a no-op satisfies
  // useSyncExternalStore's contract while the value is snapshotted each render.
  return () => {};
}

export function readCssVarValue(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return resolved || fallback;
}
