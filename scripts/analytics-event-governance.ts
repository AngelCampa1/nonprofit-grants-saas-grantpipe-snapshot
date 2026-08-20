import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ANALYTICS_EVENTS } from "../packages/shared/src/constants/analytics";

export type AnalyticsEventLiteral = {
  eventName: string;
  filePath: string;
  line: number;
};

const SCAN_ROOTS = ["apps/web/src", "apps/api/src", "packages/ui/src", "apps/site/src"] as const;

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".astro"]);

const TECHNICAL_TELEMETRY_EVENTS = new Set([
  "feedback_widget_unavailable",
  "feedback_widget_loader_skipped",
  "feedback_widget_loader_ready",
  "feedback_widget_loader_failed",
  "feedback_widget_loader_injected",
  "feedback_widget_loader_removed",
]);

const CAPTURE_LITERAL_PATTERN =
  /\b(?:captureEvent|captureRedirectEvent|trackEvent)\(\s*["']([a-z0-9_]+)["']/g;

function shouldScanFile(filePath: string): boolean {
  if (filePath.includes("node_modules")) return false;
  if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) return false;
  for (const extension of SCAN_EXTENSIONS) {
    if (filePath.endsWith(extension)) return true;
  }
  return false;
}

function walkFiles(root: string): string[] {
  const stat = statSync(root, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return shouldScanFile(root) ? [root] : [];
  return readdirSync(root).flatMap((entry) => walkFiles(join(root, entry)));
}

function lineNumberForIndex(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

export function collectAnalyticsEventLiterals(repoRoot: string): AnalyticsEventLiteral[] {
  return SCAN_ROOTS.flatMap((scanRoot) => walkFiles(join(repoRoot, scanRoot))).flatMap(
    (filePath) => {
      const source = readFileSync(filePath, "utf8");
      return [...source.matchAll(CAPTURE_LITERAL_PATTERN)].map((match) => ({
        eventName: match[1]!,
        filePath,
        line: lineNumberForIndex(source, match.index ?? 0),
      }));
    },
  );
}

export function getNonCanonicalAnalyticsEvents(
  events: AnalyticsEventLiteral[],
): AnalyticsEventLiteral[] {
  const canonicalEvents = new Set<string>(Object.values(ANALYTICS_EVENTS));
  return events
    .filter(
      (event) =>
        !canonicalEvents.has(event.eventName) && !TECHNICAL_TELEMETRY_EVENTS.has(event.eventName),
    )
    .sort((a, b) => a.eventName.localeCompare(b.eventName) || a.filePath.localeCompare(b.filePath));
}
