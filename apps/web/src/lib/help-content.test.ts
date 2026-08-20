import { describe, expect, it } from "vitest";
import {
  HELP_ARTICLES,
  canUseHelpArticle,
  getQuickHelpTasks,
  searchHelpArticles,
  type HelpArticle,
} from "./help-content";

describe("help content", () => {
  it("includes a PDF guide written for non-technical users", () => {
    const pdfGuide = HELP_ARTICLES.find((article) => article.key === "open_pdf_report");

    expect(pdfGuide?.title).toBe("Open a downloaded report");
    expect(pdfGuide?.steps.join(" ")).toMatch(/Downloads folder/);
    expect(pdfGuide?.steps.join(" ")).toMatch(/Adobe Reader/);
  });

  it("searches by plain-language terms", () => {
    expect(searchHelpArticles("spreadsheet", "All").map((article) => article.key)).toContain(
      "import_contacts",
    );
    expect(searchHelpArticles("pdf", "Reports").map((article) => article.key)).toEqual([
      "generate_report",
      "open_pdf_report",
    ]);
    expect(searchHelpArticles("form 990", "Reports").map((article) => article.key)).toContain(
      "functional_expenses_report",
    );
  });

  it("keeps accounting report guidance in specific help articles", () => {
    const activitiesGuide = HELP_ARTICLES.find(
      (article) => article.key === "statement_of_activities_report",
    );
    const functionalGuide = HELP_ARTICLES.find(
      (article) => article.key === "functional_expenses_report",
    );

    expect(activitiesGuide?.summary).toMatch(/net asset changes/i);
    expect(activitiesGuide?.searchText).toMatch(/audit/);
    expect(functionalGuide?.summary).toMatch(/program services/i);
    expect(functionalGuide?.searchText).toMatch(/990/);
  });

  it("filters CTAs by role and allows unrestricted articles", () => {
    const inviteGuide = HELP_ARTICLES.find((article) => article.key === "invite_teammate")!;
    const unrestrictedGuide = {
      ...inviteGuide,
      cta: { label: "Read guide", to: "/reports" as const },
    };

    expect(canUseHelpArticle(inviteGuide, "admin")).toBe(true);
    expect(canUseHelpArticle(inviteGuide, null)).toBe(false);
    expect(canUseHelpArticle(unrestrictedGuide, null)).toBe(true);
  });

  it("derives quick task links from shared help article CTAs", () => {
    expect(getQuickHelpTasks("admin")).toEqual([
      HELP_ARTICLES.find((article) => article.key === "import_contacts")!.cta,
      HELP_ARTICLES.find((article) => article.key === "record_donation")!.cta,
      HELP_ARTICLES.find((article) => article.key === "create_grant")!.cta,
      HELP_ARTICLES.find((article) => article.key === "open_pdf_report")!.cta,
      HELP_ARTICLES.find((article) => article.key === "invite_teammate")!.cta,
    ]);
    expect(getQuickHelpTasks("viewer").map((task) => task.to)).toEqual(["/reports"]);
  });

  it("returns all articles when the search is blank", () => {
    expect(searchHelpArticles("   ", "All")).toHaveLength(HELP_ARTICLES.length);
  });

  it("keeps search working for articles that do not define aliases", () => {
    const articleWithoutAliases: HelpArticle = {
      key: "first_setup",
      title: "Aliasless branch guide",
      summary: "Unique branch summary",
      category: "Start here",
      steps: ["Read the branch guide."],
      cta: { label: "Open settings", to: "/settings" },
      searchText: "unique-aliasless-token",
    };

    HELP_ARTICLES.push(articleWithoutAliases);

    try {
      expect(
        searchHelpArticles("unique-aliasless-token", "All").map((article) => article.key),
      ).toContain("first_setup");
    } finally {
      HELP_ARTICLES.pop();
    }
  });
});
