import type { AppRole } from "../config/nav";
import {
  HELP_CATEGORIES as SHARED_HELP_CATEGORIES,
  appKnowledge,
  canUseHelpArticle as canUseSharedHelpArticle,
  searchHelpArticles as searchSharedHelpArticles,
  type KnowledgeHelpArticle,
  type KnowledgeRoutePath,
} from "@grantpipe/shared/knowledge";

export type HelpCategory = "Start here" | "Daily work" | "Reports" | "Admin";

export type HelpArticle = Omit<
  KnowledgeHelpArticle,
  "category" | "aliases" | "steps" | "cta" | "consumers" | "visibility" | "safety"
> & {
  category: HelpCategory;
  aliases?: readonly string[];
  steps: readonly string[];
  cta: {
    label: string;
    to: Exclude<KnowledgeRoutePath, "/help">;
    hash?: string;
    roles?: readonly AppRole[];
  };
  consumers?: KnowledgeHelpArticle["consumers"];
  visibility?: KnowledgeHelpArticle["visibility"];
  safety?: KnowledgeHelpArticle["safety"];
};

export const HELP_ARTICLES: HelpArticle[] = appKnowledge.helpArticles;

export const HELP_CATEGORIES: HelpCategory[] = [...SHARED_HELP_CATEGORIES];

export const QUICK_HELP_TASK_KEYS = [
  "import_contacts",
  "record_donation",
  "create_grant",
  "open_pdf_report",
  "invite_teammate",
] as const satisfies readonly HelpArticle["key"][];

export function getQuickHelpTasks(role: AppRole | null | undefined) {
  return QUICK_HELP_TASK_KEYS.map((key) => HELP_ARTICLES.find((article) => article.key === key))
    .filter((article): article is HelpArticle => Boolean(article))
    .filter((article) => canUseHelpArticle(article, role))
    .map((article) => article.cta)
    .filter(
      (
        cta,
      ): cta is HelpArticle["cta"] & {
        to: Exclude<KnowledgeRoutePath, "/help">;
      } => Boolean(cta.to),
    );
}

export function canUseHelpArticle(article: HelpArticle, role: AppRole | null | undefined) {
  return canUseSharedHelpArticle(article as KnowledgeHelpArticle, role);
}

export function searchHelpArticles(query: string, category: HelpCategory | "All") {
  return searchSharedHelpArticles(query, category) as HelpArticle[];
}
