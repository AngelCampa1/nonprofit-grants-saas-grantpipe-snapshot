export * from "./types";
export { FEATURE_KNOWLEDGE } from "./feature-knowledge";

import { FEATURE_KNOWLEDGE } from "./feature-knowledge";
import type { FeatureKnowledge } from "./types";

const normalize = (path: string): string =>
  path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

/** Look up the knowledge entry whose route matches `path` (trailing slash ignored). */
export function getFeatureKnowledge(path: string): FeatureKnowledge | undefined {
  const target = normalize(path);
  return FEATURE_KNOWLEDGE.find((entry) => normalize(entry.route) === target);
}
