import { GUIDE_KEYS } from "../validators/help";
import { APP_KNOWLEDGE_INDEX } from "./app";
import { PUBLIC_KNOWLEDGE_INDEX } from "./generated/indexes";
import { marketingKnowledge } from "./marketing";
import type { KnowledgeConsumerJson } from "./types";

export * from "./types";
export * from "./app";
export * from "./generated/indexes";
export * from "./marketing";
export * from "./ai-cs";
export { GUIDE_KEYS } from "../validators/help";

export const appKnowledge = APP_KNOWLEDGE_INDEX;

export function validateKnowledgeIndexes(): string[] {
  const issues: string[] = [];
  const guideKeys = APP_KNOWLEDGE_INDEX.helpArticles.map((article) => article.key);

  if (guideKeys.join("|") !== GUIDE_KEYS.join("|")) {
    issues.push("App help article keys do not match GUIDE_KEYS.");
  }

  for (const entry of PUBLIC_KNOWLEDGE_INDEX.entries) {
    if (entry.visibility !== "public" || entry.safety !== "public-safe") {
      issues.push(`Public entry ${entry.id} is not public-safe.`);
    }
  }

  for (const article of APP_KNOWLEDGE_INDEX.helpArticles) {
    if (article.visibility !== "authenticated" || article.safety !== "authenticated-user-safe") {
      issues.push(`App help article ${article.key} is not authenticated-user-safe.`);
    }
  }

  return issues;
}

export function buildPublicKnowledgeJson(consumer: KnowledgeConsumerJson): string {
  const supportMarketing = { ...marketingKnowledge };
  Reflect.deleteProperty(supportMarketing, "competitorBattlecards");
  const payload =
    consumer === "marketing_ai_sdr"
      ? { consumer, marketing: marketingKnowledge }
      : { consumer, marketing: supportMarketing, app: appKnowledge };

  return `${JSON.stringify(payload, null, 2)}\n`;
}
