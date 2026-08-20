import type { TrustSignal } from "../types";

export interface CategoryStyle {
  textColor: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
}

export const CATEGORY_STYLES: Record<TrustSignal["category"], CategoryStyle> = {
  feature: {
    textColor: "text-neutral-600",
    bgColor: "bg-neutral-50",
    borderColor: "border-neutral-300",
    iconColor: "text-accent-500",
  },
  roi: {
    textColor: "text-success-700",
    bgColor: "bg-success-50",
    borderColor: "border-success-300",
    iconColor: "text-success-500",
  },
  compliance: {
    textColor: "text-primary-700",
    bgColor: "bg-primary-50",
    borderColor: "border-primary-300",
    iconColor: "text-primary-500",
  },
  integration: {
    textColor: "text-neutral-600",
    bgColor: "bg-neutral-50",
    borderColor: "border-neutral-300",
    iconColor: "text-neutral-500",
  },
};

export function mergeCategoryStyles(
  base: Record<TrustSignal["category"], CategoryStyle>,
  overrides: Partial<Record<TrustSignal["category"], Partial<CategoryStyle>>>,
): Record<TrustSignal["category"], CategoryStyle> {
  const result = { ...base };
  for (const key of Object.keys(overrides) as TrustSignal["category"][]) {
    const override = overrides[key];
    if (override) {
      result[key] = { ...result[key], ...override };
    }
  }
  return result;
}

export interface IconColorPresentation {
  className?: string;
  color?: string;
}

const CSS_COLOR_PREFIXES = [
  "#",
  "rgb(",
  "rgba(",
  "hsl(",
  "hsla(",
  "oklch(",
  "oklab(",
  "lab(",
  "lch(",
  "color(",
  "color-mix(",
  "var(",
];

export function resolveIconColorPresentation(iconColor: string): IconColorPresentation {
  const trimmed = iconColor.trim();

  if (trimmed.length === 0) {
    return {};
  }

  if (
    trimmed === "currentColor" ||
    CSS_COLOR_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
  ) {
    return { color: trimmed };
  }

  return { className: trimmed };
}

export const CATEGORY_ICONS: Record<TrustSignal["category"], string> = {
  feature: "M2 7L5.5 10.5L12 4",
  roi: "M7 1v12M3 5l4-4 4 4",
  compliance: "M7 1L1 4v4c0 3.3 2.6 6.4 6 7 3.4-.6 6-3.7 6-7V4L7 1z",
  integration: "M5 1v3H1v6h4v3l4-4.5L5 4",
};
