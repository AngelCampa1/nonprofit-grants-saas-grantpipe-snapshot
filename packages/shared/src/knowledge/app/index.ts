import type {
  AppKnowledgeIndex,
  HelpCategory,
  KnowledgeAppRole,
  KnowledgeHelpArticle,
} from "../types";
import { ADMIN_ONLY_ROLES, EDITOR_UP_ROLES, READ_ONLY_ROLES, STANDARD_ROLES } from "../../types";
import { HELP_ARTICLES, HELP_CATEGORIES } from "./help";

export { HELP_ARTICLES, HELP_CATEGORIES };
export type { HelpCategory, KnowledgeAppRole, KnowledgeHelpArticle };

const authenticatedRoles: readonly KnowledgeAppRole[] = READ_ONLY_ROLES;
const standardRoles: readonly KnowledgeAppRole[] = STANDARD_ROLES;

export const APP_KNOWLEDGE_INDEX: AppKnowledgeIndex = {
  generatedAt: "2026-05-09",
  helpCategories: HELP_CATEGORIES,
  helpArticles: HELP_ARTICLES,
  routes: [
    { path: "/help", label: "Help", roles: authenticatedRoles, supportSafe: true },
    { path: "/donors", label: "Donors", roles: standardRoles, supportSafe: true },
    { path: "/donors/pledges", label: "Pledges", roles: standardRoles, supportSafe: true },
    { path: "/funds", label: "Funds", roles: authenticatedRoles, supportSafe: true },
    { path: "/grants", label: "Grants", roles: authenticatedRoles, supportSafe: true },
    {
      path: "/grants/sentinel",
      label: "Budget Sentinel",
      roles: authenticatedRoles,
      supportSafe: true,
    },
    {
      path: "/import",
      label: "Import",
      roles: EDITOR_UP_ROLES,
      supportSafe: true,
    },
    { path: "/reports", label: "Reports", roles: authenticatedRoles, supportSafe: true },
    {
      path: "/accounting/reports/activities",
      label: "Statement of Activities",
      roles: authenticatedRoles,
      supportSafe: true,
    },
    {
      path: "/accounting/reports/functional-expenses",
      label: "Functional Expenses",
      roles: authenticatedRoles,
      supportSafe: true,
    },
    { path: "/settings", label: "Settings", roles: ADMIN_ONLY_ROLES, supportSafe: true },
  ],
};

export function canUseHelpArticle(
  article: KnowledgeHelpArticle,
  role: KnowledgeAppRole | null | undefined,
): boolean {
  return !article.cta.roles || (role ? article.cta.roles.includes(role) : false);
}

export function searchHelpArticles(
  query: string,
  category: HelpCategory | "All",
): KnowledgeHelpArticle[] {
  const normalized = query.trim().toLowerCase();
  return HELP_ARTICLES.filter((article) => {
    const categoryMatches = category === "All" || article.category === category;
    const queryMatches =
      normalized.length === 0 ||
      `${article.title} ${article.summary} ${article.searchText} ${(article.aliases ?? []).join(
        " ",
      )}`
        .toLowerCase()
        .includes(normalized);
    return categoryMatches && queryMatches;
  });
}
