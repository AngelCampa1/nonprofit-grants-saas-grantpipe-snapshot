import { APP_KNOWLEDGE_INDEX, GUIDE_KEYS } from "@grantpipe/shared/knowledge";
import { describe, expect, it } from "vitest";
import { HELP_ARTICLES } from "./help-content";

describe("help knowledge source", () => {
  it("uses shared app knowledge articles as the in-app help source", () => {
    expect(HELP_ARTICLES).toBe(APP_KNOWLEDGE_INDEX.helpArticles);
    expect(HELP_ARTICLES.map((article) => article.key)).toEqual(GUIDE_KEYS);
  });
});
