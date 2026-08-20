import type { BuyerStage } from "../types";

export interface StageBadge {
  label: string;
  classes: string;
}

export const STAGE_BADGES: Record<BuyerStage, StageBadge> = {
  tofu: {
    label: "Guide",
    classes: "bg-primary-50 text-primary-700 border-primary-200",
  },
  mofu: {
    label: "Compare",
    classes: "bg-accent-50 text-accent-700 border-accent-200",
  },
  bofu: {
    label: "Alternative",
    classes: "bg-success-50 text-success-700 border-success-200",
  },
};

export function formatContentDate(dateString: string): string {
  const normalized = dateString.includes("T") ? dateString : `${dateString}T00:00:00`;
  return new Date(normalized).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function filterMetadata(
  metadata?: Record<string, string>,
  excludeKeys?: string[],
): [string, string][] {
  if (!metadata) return [];
  const exclude = new Set(excludeKeys);
  return Object.entries(metadata).filter(([key, v]) => v && !exclude.has(key)) as [
    string,
    string,
  ][];
}
