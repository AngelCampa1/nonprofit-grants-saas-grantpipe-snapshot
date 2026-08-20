import type { SiteConfig } from "../types.js";

type Theme = SiteConfig["theme"];

// ── Color conversion helpers (OKLCH-based) ──────────────────────────────────

/**
 * Parse a hex color string to { r, g, b } (0–255).
 * Accepts both 6-digit (#rrggbb) and 3-digit (#rgb) shorthand.
 * 3-digit hex is expanded by doubling each digit: #abc → #aabbcc.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  // Expand 3-digit shorthand: #abc → #aabbcc
  const expanded =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const cleaned = expanded.replace(/^#/, "");
  return {
    r: parseInt(cleaned.slice(0, 2), 16),
    g: parseInt(cleaned.slice(2, 4), 16),
    b: parseInt(cleaned.slice(4, 6), 16),
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

// ── sRGB ↔ Linear RGB ──────────────────────────────────────────────────────

/** Convert a single sRGB channel (0–1) to linear RGB. */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// ── Linear RGB ↔ XYZ (D65) ─────────────────────────────────────────────────

function linearRgbToXyz(lr: number, lg: number, lb: number): { x: number; y: number; z: number } {
  return {
    x: 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
    y: 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
    z: 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  };
}

// ── XYZ ↔ OKLAB ─────────────────────────────────────────────────────────────

function xyzToOklab(x: number, y: number, z: number): { L: number; a: number; b: number } {
  const l_ = Math.cbrt(0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z);
  const m_ = Math.cbrt(0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z);
  const s_ = Math.cbrt(0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

// ── OKLAB ↔ OKLCH ────────────────────────────────────────────────────────────

function oklabToOklch(L: number, a: number, b: number): { L: number; C: number; h: number } {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

// ── High-level conversions ───────────────────────────────────────────────────

/**
 * Convert sRGB (0–255) to OKLCH.
 * Returns L (0–1), C (typically 0–0.4), h (0–360 degrees).
 */
function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; h: number } {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);
  const xyz = linearRgbToXyz(lr, lg, lb);
  const lab = xyzToOklab(xyz.x, xyz.y, xyz.z);
  return oklabToOklch(lab.L, lab.a, lab.b);
}

// ── Scaled OKLCH helpers (h/C/L on 0–360/0–100/0–100 scale) ────────────────

/**
 * Convert RGB (0–255) to OKLCH with scaled values for internal use.
 * Returns h (0–360), s (OKLCH chroma × 100), l (OKLCH lightness × 100).
 */
function rgbToOklchScaled(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const oklch = rgbToOklch(r, g, b);
  return {
    h: oklch.h,
    s: oklch.C * 100, // normalize chroma to 0–100 scale for API compat
    l: oklch.L * 100, // normalize lightness to 0–100 scale for API compat
  };
}

/**
 * Convert scaled OKLCH values to a 6-digit hex string.
 * h (0–360), s (OKLCH chroma × 100), l (OKLCH lightness × 100).
 */
function rgbToHslScaled(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  if (max === nr) {
    hue = ((ng - nb) / delta) % 6;
  } else if (max === ng) {
    hue = (nb - nr) / delta + 2;
  } else {
    hue = (nr - ng) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslScaledToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (segment >= 0 && segment < 1) {
    rPrime = chroma;
    gPrime = x;
  } else if (segment < 2) {
    rPrime = x;
    gPrime = chroma;
  } else if (segment < 3) {
    gPrime = chroma;
    bPrime = x;
  } else if (segment < 4) {
    gPrime = x;
    bPrime = chroma;
  } else if (segment < 5) {
    rPrime = x;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = x;
  }

  const match = lightness - chroma / 2;
  const r = clamp(Math.round((rPrime + match) * 255));
  const g = clamp(Math.round((gPrime + match) * 255));
  const b = clamp(Math.round((bPrime + match) * 255));

  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
}

// ── Scale generation ─────────────────────────────────────────────────────────

/**
 * OKLCH lightness values (0–100 scale) for the 50–950 steps.
 * OKLCH lightness is perceptually uniform: equal numeric steps produce
 * equal perceived brightness differences. Values mapped from Tailwind's
 * visual intent: step 50 = very light, step 950 = deepest.
 */
const LIGHTNESS_STEPS = [97, 93, 87, 79, 69, 60, 45, 35, 27, 20, 12] as const;
const SCALE_SUFFIXES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/**
 * Scale chroma proportionally based on lightness to keep colors within sRGB
 * gamut. OKLCH allows high chroma at any lightness, but sRGB cannot display
 * vivid colors near white or black. This function reduces chroma as lightness
 * approaches 0 or 1, mimicking how HSL naturally desaturates at extremes.
 *
 * At L=0.5 (peak chroma zone), the full chroma is preserved.
 * At L=0.97 or L=0.12, chroma is reduced to produce proper tints/shades.
 */
function scaleChromaForLightness(chroma: number, lightness: number): number {
  // How far from the extremes (0 or 1) — peak at 0.5
  const distFromEdge = Math.min(lightness, 1 - lightness);
  // Keep a meaningful tint at the scale edges, then ramp up toward full
  // chroma through the middle of the scale. Gamut mapping handles any overflow.
  const factor = 0.18 + Math.min(1, distFromEdge * 2) * 0.82;
  return chroma * factor;
}

/**
 * Generate an 11-step color scale from a hex input, keeping the original hue,
 * varying lightness and proportionally scaling chroma to stay in sRGB gamut.
 */
function generateScale(
  hex: string,
  saturationOverride?: number,
): Record<(typeof SCALE_SUFFIXES)[number], string> {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHslScaled(r, g, b);
  const sat = saturationOverride !== undefined ? saturationOverride : s;

  const result = {} as Record<(typeof SCALE_SUFFIXES)[number], string>;
  for (let i = 0; i < SCALE_SUFFIXES.length; i++) {
    const suffix = SCALE_SUFFIXES[i];
    const lightness = LIGHTNESS_STEPS[i];
    const scaledSat = sat * scaleChromaForLightness(1, lightness / 100);
    result[suffix] = hslScaledToHex(h, scaledSat, lightness);
  }
  return result;
}

/**
 * Detect whether a surface hex is "tinted" (not white or near-white).
 * Returns true when the surface is clearly non-white (chroma > threshold).
 */
function isTintedSurface(hex: string): boolean {
  if (!hex || hex.toLowerCase() === "#ffffff") return false;
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // delta > 8 means some measurable chroma; average > 180 means it's light
  const isNearWhite = (r + g + b) / 3 > 180;
  const hasChroma = max - min > 8;
  return isNearWhite && hasChroma;
}

/**
 * Generate the neutral scale.
 *
 * - If `surface` is provided and tinted, use the surface hue/saturation
 *   reduced slightly, with the surface itself anchoring the 50 step.
 * - Otherwise generate a plain gray (saturation = 0).
 */
function generateNeutralScale(surface?: string): Record<(typeof SCALE_SUFFIXES)[number], string> {
  if (surface && isTintedSurface(surface)) {
    const { r, g, b } = hexToRgb(surface);
    const { s } = rgbToOklchScaled(r, g, b);
    // Use a reduced saturation to keep neutrals subtle
    const neutralSat = Math.min(s, 12);
    const scale = generateScale(surface, neutralSat);
    // Anchor the 50 step to the exact surface value so it matches the site bg
    scale[50] = surface;
    return scale;
  }
  // Plain gray
  return generateScale("#8a8a8a", 0);
}

// ── Fixed scales ─────────────────────────────────────────────────────────────

const ERROR_SCALE: Record<(typeof SCALE_SUFFIXES)[number], string> = {
  50: "#fef2f2",
  100: "#fee2e2",
  200: "#fecaca",
  300: "#fca5a5",
  400: "#f87171",
  500: "#ef4444",
  600: "#dc2626",
  700: "#b91c1c",
  800: "#991b1b",
  900: "#7f1d1d",
  950: "#450a0a",
};

const SUCCESS_SCALE: Record<(typeof SCALE_SUFFIXES)[number], string> = {
  50: "#ecfdf5",
  100: "#d1fae5",
  200: "#a7f3d0",
  300: "#6ee7b7",
  400: "#34d399",
  500: "#10b981",
  600: "#059669",
  700: "#047857",
  800: "#065f46",
  900: "#064e3b",
  950: "#022c22",
};

// ── Scale → CSS lines ─────────────────────────────────────────────────────────

function scaleToLines(
  prefix: string,
  scale: Record<(typeof SCALE_SUFFIXES)[number], string>,
): string {
  return SCALE_SUFFIXES.map((step) => `  --color-${prefix}-${step}: ${scale[step]};`).join("\n");
}

// ── CSS color validation ──────────────────────────────────────────────────────

/**
 * Check whether a string is a valid CSS color value.
 * Returns true for hex (#...), rgb(...), hsl(...), oklch(...).
 * Returns false for Tailwind class strings like "text-sky-500".
 */
function isCssColor(value: string): boolean {
  return (
    value.startsWith("#") ||
    value.startsWith("rgb") ||
    value.startsWith("hsl") ||
    value.startsWith("oklch")
  );
}

type ThemePresentationTokens = {
  spacing: {
    sectionPy: string;
    sectionPySm: string;
    componentGap: string;
    componentGapSm: string;
  };
  motion: {
    buttonHoverScale: string;
    buttonActiveScale: string;
    cardHoverLift: string;
    cardHoverScale: string;
    ctaPulseAnimation: string;
  };
  surfaces: {
    surfaceSecondary: string;
    surfaceElevated: string;
    surfaceSunken: string;
    surfaceGlass: string;
    surfaceGlassBorder: string;
    sectionHighlightBg: string;
  };
  shadows: {
    shadowCard: string;
    shadowLg: string;
    shadowAmbient: string;
  };
  cta: {
    primaryButtonBg: string;
    primaryButtonHoverBg: string;
    primaryButtonFg: string;
    primaryButtonBorder: string;
    primaryButtonShadow: string;
    primaryButtonRadius: string;
  };
};

function getThemePresentationTokens(theme: Theme): ThemePresentationTokens {
  const layoutDensity = theme.layoutDensity ?? "comfortable";
  const motionIntensity = theme.motionIntensity ?? "balanced";
  const surfaceStyle = theme.surfaceStyle ?? "glass";
  const ctaStyle = theme.ctaStyle ?? "solid";
  const chromeEmphasis = theme.chromeEmphasis ?? "balanced";

  const spacingByDensity: Record<
    NonNullable<Theme["layoutDensity"]>,
    ThemePresentationTokens["spacing"]
  > = {
    compact: {
      sectionPy: "clamp(2.5rem, 5vw, 4.5rem)",
      sectionPySm: "clamp(1.5rem, 3vw, 2.5rem)",
      componentGap: "clamp(1rem, 2vw, 1.75rem)",
      componentGapSm: "clamp(0.625rem, 1.25vw, 0.875rem)",
    },
    comfortable: {
      sectionPy: "clamp(3rem, 6vw, 6rem)",
      sectionPySm: "clamp(2rem, 4vw, 3rem)",
      componentGap: "clamp(1.5rem, 3vw, 2.5rem)",
      componentGapSm: "clamp(0.75rem, 1.5vw, 1rem)",
    },
    airy: {
      sectionPy: "clamp(3.5rem, 7vw, 7rem)",
      sectionPySm: "clamp(2.25rem, 5vw, 3.5rem)",
      componentGap: "clamp(1.75rem, 3.25vw, 2.75rem)",
      componentGapSm: "clamp(0.875rem, 1.75vw, 1.125rem)",
    },
  };

  const motionByIntensity: Record<
    NonNullable<Theme["motionIntensity"]>,
    ThemePresentationTokens["motion"]
  > = {
    none: {
      buttonHoverScale: "1",
      buttonActiveScale: "1",
      cardHoverLift: "0px",
      cardHoverScale: "1",
      ctaPulseAnimation: "none",
    },
    subtle: {
      buttonHoverScale: "1.005",
      buttonActiveScale: "0.995",
      cardHoverLift: "1px",
      cardHoverScale: "1.003",
      ctaPulseAnimation: "none",
    },
    balanced: {
      buttonHoverScale: "1.02",
      buttonActiveScale: "0.97",
      cardHoverLift: "2px",
      cardHoverScale: "1.01",
      ctaPulseAnimation: "cta-pulse 3s ease-in-out infinite",
    },
  };

  const surfacesByStyle: Record<
    NonNullable<Theme["surfaceStyle"]>,
    ThemePresentationTokens["surfaces"]
  > = {
    glass: {
      surfaceSecondary: "color-mix(in srgb, var(--site-surface) 86%, var(--color-neutral-50) 14%)",
      surfaceElevated: "color-mix(in srgb, var(--site-surface) 94%, white 6%)",
      surfaceSunken: "color-mix(in srgb, var(--site-surface) 82%, var(--color-neutral-200) 18%)",
      surfaceGlass: "color-mix(in srgb, var(--site-surface) 82%, transparent)",
      surfaceGlassBorder: "color-mix(in srgb, var(--site-accent) 14%, rgba(255, 255, 255, 0.65))",
      sectionHighlightBg: "color-mix(in srgb, var(--site-surface) 72%, var(--color-accent-50) 28%)",
    },
    flat: {
      surfaceSecondary: "color-mix(in srgb, var(--site-surface) 92%, var(--color-neutral-100) 8%)",
      surfaceElevated: "color-mix(in srgb, var(--site-surface) 97%, white 3%)",
      surfaceSunken: "color-mix(in srgb, var(--site-surface) 88%, var(--color-neutral-200) 12%)",
      surfaceGlass: "color-mix(in srgb, var(--site-surface) 96%, transparent)",
      surfaceGlassBorder: "color-mix(in srgb, var(--color-neutral-200) 55%, transparent)",
      sectionHighlightBg: "color-mix(in srgb, var(--site-surface) 92%, var(--color-accent-50) 8%)",
    },
    layered: {
      surfaceSecondary: "color-mix(in srgb, var(--site-surface) 82%, var(--color-accent-50) 18%)",
      surfaceElevated: "color-mix(in srgb, var(--site-surface) 90%, white 10%)",
      surfaceSunken: "color-mix(in srgb, var(--site-surface) 76%, var(--color-neutral-200) 24%)",
      surfaceGlass: "color-mix(in srgb, var(--site-surface) 78%, transparent)",
      surfaceGlassBorder: "color-mix(in srgb, var(--site-primary) 20%, rgba(255, 255, 255, 0.6))",
      sectionHighlightBg: "color-mix(in srgb, var(--site-surface) 68%, var(--color-accent-50) 32%)",
    },
  };

  const shadowsByChrome: Record<
    NonNullable<Theme["chromeEmphasis"]>,
    ThemePresentationTokens["shadows"]
  > = {
    subtle: {
      shadowCard: "0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 3px -2px rgba(15, 23, 42, 0.03)",
      shadowLg: "0 8px 18px -6px rgba(15, 23, 42, 0.08), 0 3px 8px -5px rgba(15, 23, 42, 0.04)",
      shadowAmbient: "0 16px 28px rgba(15, 23, 42, 0.05)",
    },
    balanced: {
      shadowCard: "0 4px 12px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -2px rgba(15, 23, 42, 0.04)",
      shadowLg: "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.06)",
      shadowAmbient: "0 20px 40px rgba(15, 23, 42, 0.06)",
    },
    strong: {
      shadowCard:
        "0 10px 24px -10px rgba(15, 23, 42, 0.14), 0 3px 10px -5px rgba(15, 23, 42, 0.08)",
      shadowLg: "0 18px 32px -12px rgba(15, 23, 42, 0.16), 0 6px 12px -6px rgba(15, 23, 42, 0.1)",
      shadowAmbient: "0 28px 56px rgba(15, 23, 42, 0.1)",
    },
  };

  const ctaByStyle: Record<NonNullable<Theme["ctaStyle"]>, ThemePresentationTokens["cta"]> = {
    solid: {
      primaryButtonBg: "var(--site-accent)",
      primaryButtonHoverBg: "color-mix(in srgb, var(--site-accent) 88%, white 12%)",
      primaryButtonFg: "var(--color-accent-950)",
      primaryButtonBorder: "1px solid transparent",
      primaryButtonShadow:
        "0 4px 20px color-mix(in srgb, var(--site-accent) 35%, transparent), 0 2px 4px rgba(0, 0, 0, 0.06)",
      primaryButtonRadius: "var(--radius-md)",
    },
    soft: {
      primaryButtonBg: "color-mix(in srgb, var(--site-accent) 84%, var(--site-surface) 16%)",
      primaryButtonHoverBg: "color-mix(in srgb, var(--site-accent) 78%, white 22%)",
      primaryButtonFg: "var(--color-accent-950)",
      primaryButtonBorder: "1px solid color-mix(in srgb, var(--site-accent) 24%, transparent)",
      primaryButtonShadow:
        "0 10px 22px -14px color-mix(in srgb, var(--site-accent) 42%, transparent)",
      primaryButtonRadius: "var(--radius-md)",
    },
    outline: {
      primaryButtonBg: "transparent",
      primaryButtonHoverBg: "color-mix(in srgb, var(--site-accent) 8%, var(--site-surface) 92%)",
      primaryButtonFg: "var(--site-accent)",
      primaryButtonBorder: "1px solid color-mix(in srgb, var(--site-accent) 55%, transparent)",
      primaryButtonShadow: "var(--shadow-sm)",
      primaryButtonRadius: "var(--radius-md)",
    },
  };

  const surfaces = surfacesByStyle[surfaceStyle];
  return {
    spacing: spacingByDensity[layoutDensity],
    motion: motionByIntensity[motionIntensity],
    surfaces: {
      ...surfaces,
      sectionHighlightBg:
        chromeEmphasis === "subtle"
          ? "color-mix(in srgb, var(--site-surface) 88%, var(--color-accent-50) 12%)"
          : surfaces.sectionHighlightBg,
    },
    shadows: shadowsByChrome[chromeEmphasis],
    cta: ctaByStyle[ctaStyle],
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate all CSS variable definitions from a `SiteConfig.theme` object.
 *
 * Returns a CSS string containing:
 * - `:root {}` with all site vars, color scales, and category colors
 */
export function generateThemeCSS(theme: SiteConfig["theme"]): string {
  const surface = theme.surface ?? "#ffffff";
  const text = theme.text ?? "#0f172a";
  const muted = theme.muted ?? "#64748b";
  const presentation = getThemePresentationTokens(theme);

  const primaryScale = generateScale(theme.primary);
  const accentScale = generateScale(theme.accent);
  const neutralScale = generateNeutralScale(theme.surface);

  // Category colors — use override iconColor only if it is a valid CSS color,
  // not a Tailwind class string (e.g. "text-sky-500" is invalid CSS).
  const featureOverride = theme.categoryColors?.feature?.iconColor;
  const catFeature =
    featureOverride && isCssColor(featureOverride) ? featureOverride : theme.primary;

  const roiOverride = theme.categoryColors?.roi?.iconColor;
  const catRoi = roiOverride && isCssColor(roiOverride) ? roiOverride : "#059669";

  const complianceOverride = theme.categoryColors?.compliance?.iconColor;
  const catCompliance =
    complianceOverride && isCssColor(complianceOverride) ? complianceOverride : theme.accent;

  const integrationOverride = theme.categoryColors?.integration?.iconColor;
  const catIntegration =
    integrationOverride && isCssColor(integrationOverride) ? integrationOverride : "#64748b";

  // Build :root block
  const rootLines = [
    `  /* ── Site vars ── */`,
    `  --site-primary: ${theme.primary};`,
    `  --site-accent: ${theme.accent};`,
    `  --site-surface: ${surface};`,
    `  --site-text: ${text};`,
    `  --site-muted: ${muted};`,
    `  --site-surface-secondary: ${presentation.surfaces.surfaceSecondary};`,
    `  --site-surface-elevated: ${presentation.surfaces.surfaceElevated};`,
    `  --site-surface-sunken: ${presentation.surfaces.surfaceSunken};`,
    `  --site-surface-glass: ${presentation.surfaces.surfaceGlass};`,
    `  --site-surface-glass-border: ${presentation.surfaces.surfaceGlassBorder};`,
    `  --site-section-highlight-bg: ${presentation.surfaces.sectionHighlightBg};`,
    `  --site-shadow-card: ${presentation.shadows.shadowCard};`,
    `  --site-shadow-lg: ${presentation.shadows.shadowLg};`,
    `  --site-shadow-ambient: ${presentation.shadows.shadowAmbient};`,
    `  --site-section-py: ${presentation.spacing.sectionPy};`,
    `  --site-section-py-sm: ${presentation.spacing.sectionPySm};`,
    `  --site-component-gap: ${presentation.spacing.componentGap};`,
    `  --site-component-gap-sm: ${presentation.spacing.componentGapSm};`,
    `  --site-button-hover-scale: ${presentation.motion.buttonHoverScale};`,
    `  --site-button-active-scale: ${presentation.motion.buttonActiveScale};`,
    `  --site-card-hover-lift: ${presentation.motion.cardHoverLift};`,
    `  --site-card-hover-scale: ${presentation.motion.cardHoverScale};`,
    `  --site-cta-pulse-animation: ${presentation.motion.ctaPulseAnimation};`,
    `  --site-primary-button-bg: ${presentation.cta.primaryButtonBg};`,
    `  --site-primary-button-hover-bg: ${presentation.cta.primaryButtonHoverBg};`,
    `  --site-primary-button-fg: ${presentation.cta.primaryButtonFg};`,
    `  --site-primary-button-border: ${presentation.cta.primaryButtonBorder};`,
    `  --site-primary-button-shadow: ${presentation.cta.primaryButtonShadow};`,
    `  --site-primary-button-radius: ${presentation.cta.primaryButtonRadius};`,
    ``,
    `  /* ── GrantPipe marketing handoff tokens ──`,
    `     Every --gp-* token is an alias of a canonical design-system token.`,
    `     Keep semantic tokens aligned with packages/ui site variables. */`,
    `  --gp-emerald-900: var(--color-primary-950);`,
    `  --gp-emerald-800: var(--color-primary-900);`,
    `  --gp-emerald-700: var(--color-primary-800);`,
    `  --gp-emerald-600: var(--color-primary-700);`,
    `  --gp-emerald-500: var(--color-primary-600);`,
    `  --gp-emerald-100: var(--color-primary-100);`,
    `  --gp-emerald-50: var(--color-primary-50);`,
    `  --gp-gold-800: var(--color-accent-800);`,
    `  --gp-gold-700: var(--color-accent-700);`,
    `  --gp-gold-600: var(--color-accent-600);`,
    `  --gp-gold-500: var(--color-accent-500);`,
    `  --gp-gold-100: var(--color-accent-100);`,
    `  --gp-gold-50: var(--color-accent-50);`,
    `  --gp-ink-900: var(--color-brand-text);`,
    `  --gp-ink-700: var(--color-neutral-700);`,
    `  --gp-ink-600: var(--color-neutral-600);`,
    `  --gp-ink-500: var(--color-neutral-500);`,
    `  --gp-ink-400: var(--color-neutral-400);`,
    `  --gp-ink-300: var(--color-neutral-300);`,
    `  --gp-ink-200: var(--color-neutral-200);`,
    `  --gp-ink-100: var(--color-neutral-100);`,
    `  --gp-paper: var(--surface-primary);`,
    `  --gp-paper-1: var(--surface-primary);`,
    `  --gp-paper-2: var(--surface-secondary);`,
    `  --gp-card: var(--surface-elevated);`,
    `  --gp-danger: var(--color-error-600);`,
    `  --gp-warn: var(--color-accent-600);`,
    `  --gp-rad-sm: var(--radius-xs);`,
    `  --gp-rad: var(--radius-sm);`,
    `  --gp-rad-md: var(--radius-md);`,
    `  --gp-rad-lg: var(--radius-md);`,
    `  --gp-pill: var(--radius-full);`,
    `  --gp-shadow-sm: var(--shadow-sm);`,
    `  --gp-shadow: var(--shadow-card);`,
    `  --gp-shadow-lg: var(--shadow-lg);`,
    ``,
    `  /* ── Primary scale ── */`,
    scaleToLines("primary", primaryScale),
    ``,
    `  /* ── Accent scale ── */`,
    scaleToLines("accent", accentScale),
    ``,
    `  /* ── Category colors ── */`,
    `  --site-category-feature: ${catFeature};`,
    `  --site-category-roi: ${catRoi};`,
    `  --site-category-compliance: ${catCompliance};`,
    `  --site-category-integration: ${catIntegration};`,
    ``,
    `  /* ── Neutral scale ── */`,
    scaleToLines("neutral", neutralScale),
    ``,
    `  /* ── Success scale ── */`,
    scaleToLines("success", SUCCESS_SCALE),
    ``,
    `  /* ── Error scale ── */`,
    scaleToLines("error", ERROR_SCALE),
  ].join("\n");

  return [`:root {`, rootLines, `}`, ``].join("\n");
}
