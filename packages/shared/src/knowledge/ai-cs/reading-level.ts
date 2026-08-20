import { FEATURE_KNOWLEDGE } from "./feature-knowledge";
import type { FeatureKnowledge } from "./types";

/**
 * Plain-language readability gate for the AI-CS curated knowledge base.
 *
 * AI-CS must teach a complete beginner — someone who has never used software
 * like this — how to operate GrantPipe. The teaching prose therefore has to stay
 * readable at roughly a third-to-fifth grade level even as the product (and the
 * knowledge that mirrors it) changes. These helpers turn that requirement into
 * deterministic numbers a test can assert, so a future edit that smuggles in long
 * sentences or dense jargon breaks the build instead of silently shipping.
 *
 * Necessary federal terms (for example "indirect cost rate") are long by nature
 * and must stay, so the Flesch-Kincaid ceiling is a generous backstop. The tight,
 * controllable gates are structural: short sentences, one idea each, and none of
 * the punctuation that signals AI-bloated or hard-to-read copy.
 */

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const WORD = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g;

/** Split prose into trimmed, non-empty sentences. */
export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Extract word tokens (letters/digits, keeping internal hyphens and apostrophes). */
export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

/**
 * Estimate the syllable count of a single word with the standard vowel-group
 * heuristic: count runs of vowels, drop a silent trailing "e", and never return
 * less than one. Approximate but deterministic — the right tool for a CI gate.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  if (w.endsWith("e") && !w.endsWith("le") && count > 1) {
    count -= 1;
  }
  return Math.max(1, count);
}

export interface ReadabilityReport {
  /** Flesch-Kincaid grade level (clamped at 0). */
  grade: number;
  sentenceCount: number;
  wordCount: number;
  /** Mean words per sentence, rounded to one decimal. */
  avgWordsPerSentence: number;
  /** Word count of the single longest sentence. */
  longestSentenceWords: number;
}

/**
 * Compute readability statistics for a block of prose. Returns zeroed stats for
 * empty input so callers never divide by zero.
 */
export function analyzeReadability(text: string): ReadabilityReport {
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  if (sentenceCount === 0) {
    return {
      grade: 0,
      sentenceCount: 0,
      wordCount: 0,
      avgWordsPerSentence: 0,
      longestSentenceWords: 0,
    };
  }
  let wordCount = 0;
  let syllableCount = 0;
  let longestSentenceWords = 0;
  for (const sentence of sentences) {
    const tokens = words(sentence);
    wordCount += tokens.length;
    longestSentenceWords = Math.max(longestSentenceWords, tokens.length);
    for (const token of tokens) {
      syllableCount += countSyllables(token);
    }
  }
  const avgWordsPerSentence = wordCount / sentenceCount;
  const grade =
    wordCount === 0 ? 0 : 0.39 * avgWordsPerSentence + 11.8 * (syllableCount / wordCount) - 15.59;
  return {
    grade: Math.max(0, Math.round(grade * 10) / 10),
    sentenceCount,
    wordCount,
    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
    longestSentenceWords,
  };
}

/**
 * Gather everything AI-CS would actually say to a user about one screen — the
 * "what", the "why", and every how-step instruction — into a single prose block.
 * Titles and raw UI labels are excluded: they are nouns, not teaching sentences,
 * and would distort the sentence-length math.
 */
export function teachingProse(entry: FeatureKnowledge): string {
  const parts = [entry.what, entry.why, ...entry.how.map((step) => step.action)];
  return parts.join(" ");
}

export interface EntryReadability {
  key: string;
  report: ReadabilityReport;
  /** Disallowed punctuation found in the teaching prose (empty when clean). */
  bannedPunctuation: string[];
}

/** Punctuation that signals hard-to-read or AI-bloated copy. */
const BANNED_PUNCTUATION: { label: string; pattern: RegExp }[] = [
  { label: "semicolon", pattern: /;/ },
  { label: "em dash", pattern: /—/ },
  { label: "en dash", pattern: /–/ },
  { label: "curly double quote", pattern: /[“”]/ },
  { label: "curly single quote", pattern: /[‘’]/ },
];

/** Readability report plus banned-punctuation findings for one entry. */
export function gradeEntry(entry: FeatureKnowledge): EntryReadability {
  const prose = teachingProse(entry);
  const bannedPunctuation = BANNED_PUNCTUATION.filter((b) => b.pattern.test(prose)).map(
    (b) => b.label,
  );
  return { key: entry.key, report: analyzeReadability(prose), bannedPunctuation };
}

/** Grade every curated knowledge entry. */
export function gradeAllEntries(): EntryReadability[] {
  return FEATURE_KNOWLEDGE.map(gradeEntry);
}

/**
 * Reading-level thresholds the curated knowledge base must satisfy. Tuned so the
 * current third-grade prose passes with headroom while a real regression (long
 * sentences, dense jargon) trips the gate.
 */
export const READING_LEVEL_LIMITS = {
  /** Hard ceiling on Flesch-Kincaid grade per entry (generous: federal terms are long). */
  maxGrade: 8,
  /** Mean words per sentence per entry. */
  maxAvgWordsPerSentence: 14,
  /** No single sentence may exceed this many words. */
  maxSentenceWords: 22,
} as const;
