import type { Role } from "../../types";

/** One numbered how-to step. `label` is the exact on-screen anchor the user clicks. */
export interface HowToStep {
  /** The exact visible UI string (button/tab/field). Must also appear in the owning entry's `uiLabels`. */
  label: string;
  /** Plain-language instruction performed at that anchor. Third-grade reading level. */
  action: string;
}

/** Everything AI-CS needs to teach one screen. */
export interface FeatureKnowledge {
  /** Stable snake_case id, unique across the array. */
  key: string;
  /** In-app path, must exist in the generated route tree. */
  route: string;
  /** Plain title a user would recognize. */
  title: string;
  /** What this screen is, in one or two plain sentences. */
  what: string;
  /** Why it exists / when to use it. Teaches judgement, not just clicks. */
  why: string;
  /** Ordered steps. Each `label` is an exact on-screen anchor. */
  how: HowToStep[];
  /** Every exact UI string referenced by `how`. The build asserts each appears in the route source. */
  uiLabels: string[];
  /** Roles that can reach this screen, if restricted. */
  roles?: Role[];
  /** Related feature keys, for follow-up suggestions. */
  related?: string[];
  /** Things users confuse this with but it is NOT (abstention anchors). */
  notFeatures?: string[];
}

/** Bumped whenever FEATURE_KNOWLEDGE changes; surfaced in observability for sync auditing. */
export const AI_CS_KNOWLEDGE_VERSION = "2026-06-20.2";
