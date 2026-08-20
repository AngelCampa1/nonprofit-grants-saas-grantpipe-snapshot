export const EASING = {
  outQuart: "cubic-bezier(0.25, 1, 0.5, 1)",
  outCubic: "cubic-bezier(0.33, 1, 0.68, 1)",
  outExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOutCubic: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

export const DURATION = {
  fast: 150,
  normal: 200,
  slow: 300,
} as const;

/** Returns true if the user prefers reduced motion, false otherwise.
 *  Returns false in SSR environments where window is not available. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
