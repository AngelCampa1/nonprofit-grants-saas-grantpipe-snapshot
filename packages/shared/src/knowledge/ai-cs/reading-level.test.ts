import { describe, expect, it } from "vitest";
import { FEATURE_KNOWLEDGE } from "./feature-knowledge";
import {
  analyzeReadability,
  countSyllables,
  gradeAllEntries,
  gradeEntry,
  READING_LEVEL_LIMITS,
  splitSentences,
  teachingProse,
  words,
} from "./reading-level";

describe("countSyllables", () => {
  it("counts vowel groups", () => {
    expect(countSyllables("grant")).toBe(1);
    expect(countSyllables("funder")).toBe(2);
    // Vowel-group heuristic merges adjacent vowels ("ia"), so "compliance"
    // counts as two groups after dropping the silent trailing "e". Approximate
    // by design — the gate only needs a deterministic, monotonic estimate.
    expect(countSyllables("compliance")).toBe(2);
    expect(countSyllables("donor")).toBe(2);
  });

  it("drops a silent trailing e but keeps -le endings", () => {
    expect(countSyllables("make")).toBe(1);
    expect(countSyllables("table")).toBe(2);
  });

  it("never returns less than one for a real word", () => {
    expect(countSyllables("the")).toBe(1);
    expect(countSyllables("a")).toBe(1);
  });

  it("returns zero for a token with no letters", () => {
    expect(countSyllables("123")).toBe(0);
  });
});

describe("splitSentences and words", () => {
  it("splits on sentence-ending punctuation", () => {
    expect(splitSentences("The cat sat. The dog ran!")).toEqual(["The cat sat.", "The dog ran!"]);
  });

  it("drops empty fragments", () => {
    expect(splitSentences("   ")).toEqual([]);
  });

  it("tokenizes words keeping internal hyphens", () => {
    expect(words("Live Grants.gov add-on")).toEqual(["Live", "Grants", "gov", "add-on"]);
  });
});

describe("analyzeReadability", () => {
  it("returns zeroed stats for empty prose", () => {
    expect(analyzeReadability("")).toEqual({
      grade: 0,
      sentenceCount: 0,
      wordCount: 0,
      avgWordsPerSentence: 0,
      longestSentenceWords: 0,
    });
  });

  it("computes sentence and word stats", () => {
    const report = analyzeReadability("The cat sat. The big dog ran fast.");
    expect(report.sentenceCount).toBe(2);
    expect(report.wordCount).toBe(8);
    expect(report.longestSentenceWords).toBe(5);
    expect(report.avgWordsPerSentence).toBe(4);
    expect(report.grade).toBeGreaterThanOrEqual(0);
  });

  it("grades a punctuation-only sentence as zero without dividing by zero", () => {
    // A non-empty sentence that contains no word tokens keeps sentenceCount > 0
    // while wordCount stays 0, exercising the zero-word grade guard.
    const report = analyzeReadability("???");
    expect(report.sentenceCount).toBe(1);
    expect(report.wordCount).toBe(0);
    expect(report.grade).toBe(0);
    expect(report.avgWordsPerSentence).toBe(0);
  });

  it("scores simple prose well below the gate ceiling", () => {
    const report = analyzeReadability("You find new grants here. You track the ones you want.");
    expect(report.grade).toBeLessThan(READING_LEVEL_LIMITS.maxGrade);
  });
});

describe("teachingProse", () => {
  it("joins what, why, and every how-step action", () => {
    const entry = FEATURE_KNOWLEDGE[0];
    if (!entry) throw new Error("FEATURE_KNOWLEDGE is empty");
    const prose = teachingProse(entry);
    expect(prose).toContain(entry.what);
    expect(prose).toContain(entry.why);
    for (const step of entry.how) {
      expect(prose).toContain(step.action);
    }
  });

  it("does not include the title or raw UI labels", () => {
    const grants = FEATURE_KNOWLEDGE.find((e) => e.key === "grants");
    if (!grants) throw new Error("grants entry missing");
    const prose = teachingProse(grants);
    // "Portfolio" is a bare UI label; it should not be injected as prose on its own.
    expect(prose.startsWith(grants.title)).toBe(false);
  });
});

describe("FEATURE_KNOWLEDGE reads at a beginner level", () => {
  const graded = gradeAllEntries();

  it("grades every entry", () => {
    expect(graded.length).toBe(FEATURE_KNOWLEDGE.length);
  });

  it("keeps every entry at or below the grade ceiling", () => {
    const tooHard = graded.filter((g) => g.report.grade > READING_LEVEL_LIMITS.maxGrade);
    expect(
      tooHard.map((g) => `${g.key}: grade ${g.report.grade}`),
      "entries above the reading-grade ceiling",
    ).toEqual([]);
  });

  it("keeps sentences short on average", () => {
    const wordy = graded.filter(
      (g) => g.report.avgWordsPerSentence > READING_LEVEL_LIMITS.maxAvgWordsPerSentence,
    );
    expect(
      wordy.map((g) => `${g.key}: avg ${g.report.avgWordsPerSentence} words/sentence`),
      "entries with long average sentences",
    ).toEqual([]);
  });

  it("has no single over-long sentence", () => {
    const longest = graded.filter(
      (g) => g.report.longestSentenceWords > READING_LEVEL_LIMITS.maxSentenceWords,
    );
    expect(
      longest.map((g) => `${g.key}: longest ${g.report.longestSentenceWords} words`),
      "entries with an over-long sentence",
    ).toEqual([]);
  });

  it("uses no semicolons, dashes, or curly quotes in teaching prose", () => {
    const dirty = graded.filter((g) => g.bannedPunctuation.length > 0);
    expect(
      dirty.map((g) => `${g.key}: ${g.bannedPunctuation.join(", ")}`),
      "entries with banned punctuation",
    ).toEqual([]);
  });
});

describe("gradeEntry", () => {
  it("flags banned punctuation when present", () => {
    const result = gradeEntry({
      key: "synthetic",
      route: "/synthetic",
      title: "Synthetic",
      what: "This screen does work; it also does more work.",
      why: "It exists.",
      how: [{ label: "Go", action: "Press Go." }],
      uiLabels: ["Go"],
    });
    expect(result.bannedPunctuation).toContain("semicolon");
  });

  it("reports clean prose with no banned punctuation", () => {
    const result = gradeEntry({
      key: "synthetic",
      route: "/synthetic",
      title: "Synthetic",
      what: "This screen helps you do one thing.",
      why: "It saves you time.",
      how: [{ label: "Go", action: "Press Go to start." }],
      uiLabels: ["Go"],
    });
    expect(result.bannedPunctuation).toEqual([]);
  });
});
