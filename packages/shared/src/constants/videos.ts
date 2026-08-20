import type { LeadMagnetSlug } from "./lead-magnets";

export type VideoCategory = "overview" | "educational" | "product";

export interface VideoChapter {
  label: string;
  seconds: number;
}

export interface VideoRecord {
  slug: VideoSlug;
  youtubeId: string;
  title: string;
  shortTitle: string;
  description: string;
  category: VideoCategory;
  pillar?: string;
  targetKeyword?: string;
  runtimeSeconds: number;
  publishedAt: string;
  chapters: VideoChapter[];
  leadMagnetSlug?: LeadMagnetSlug;
  targetPages: string[];
}

export const VIDEO_SLUGS = [
  "launch-preview",
  "one-workspace-overview",
  "product-tour",
  "grant-tracking-spreadsheet",
  "grant-budget-template",
  "single-audit",
  "track-restricted-funds",
  "fund-accounting",
  "uniform-guidance",
  "getting-started",
  "add-grant-allocate",
] as const;

export type VideoSlug = (typeof VIDEO_SLUGS)[number];

export const VIDEO_REGISTRY: Record<VideoSlug, VideoRecord> = {
  // Overview/brand videos: runtime not catalogued; downstream schema omits duration when runtimeSeconds <= 0.
  "launch-preview": {
    slug: "launch-preview",
    youtubeId: "aM62cq64cQQ",
    title: "GrantPipe Compliance-First Grant Management System",
    shortTitle: "Launch Preview",
    description:
      "A first look at GrantPipe, a compliance-first platform that keeps grants, funds, donors, and reporting in one place.",
    category: "overview",
    runtimeSeconds: 0,
    publishedAt: "2026-06-09",
    chapters: [],
    targetPages: [],
  },
  "one-workspace-overview": {
    slug: "one-workspace-overview",
    youtubeId: "dd2pJ6ZdEHI",
    title: "GrantPipe: One Workspace for Grants, Funds, Donors, and Compliance",
    shortTitle: "One Workspace Overview",
    description:
      "See how GrantPipe connects grants, restricted funds, donors, and compliance in a single workspace.",
    category: "overview",
    runtimeSeconds: 0,
    publishedAt: "2026-06-09",
    chapters: [],
    targetPages: [],
  },
  "product-tour": {
    slug: "product-tour",
    youtubeId: "o-FVZeO3rjw",
    title:
      "GrantPipe Product Tour: Grants, Restricted Funds, Compliance, and Reporting in One Workflow",
    shortTitle: "Product Tour",
    description:
      "A full walkthrough of the GrantPipe app, from adding a grant to running a compliance report.",
    category: "overview",
    runtimeSeconds: 0,
    publishedAt: "2026-06-09",
    chapters: [],
    targetPages: ["/product"],
  },
  "grant-tracking-spreadsheet": {
    slug: "grant-tracking-spreadsheet",
    youtubeId: "hOjiniNapo0",
    title: "The Missing Column in Your Grant Tracking Spreadsheet (Free Template)",
    shortTitle: "Grant Tracking Spreadsheet",
    description:
      "Learn what column most grant trackers leave out and get a free template that includes it.",
    category: "educational",
    pillar: "Tools",
    targetKeyword: "grant tracking spreadsheet",
    runtimeSeconds: 634, // ~10:34
    publishedAt: "2026-06-09",
    chapters: [
      { label: "The column auditors ask about first", seconds: 0 },
      { label: "Why most grant trackers fail", seconds: 72 },
      { label: "Tab 1 - The Grant Register", seconds: 102 },
      { label: "Restricted vs. unrestricted funds", seconds: 181 },
      { label: "Tab 2 - Budget vs. Actual", seconds: 271 },
      { label: "Tab 3 - The Expense Log (SUMIFS)", seconds: 344 },
      { label: "Tab 4 - Deadlines and dashboard", seconds: 408 },
      { label: "Protect and version your sheet", seconds: 468 },
      { label: "When a spreadsheet stops working", seconds: 526 },
      { label: "Free template + what's next", seconds: 569 },
    ],
    leadMagnetSlug: "grant-tracking-template",
    targetPages: ["/grant-tracking-software"],
  },
  "grant-budget-template": {
    slug: "grant-budget-template",
    youtubeId: "1Cg_DOTSOho",
    title: "Grant Budget Template: Build It Step by Step (Free Template)",
    shortTitle: "Grant Budget Template",
    description:
      "A step-by-step guide to building a grant budget that funders accept, with a free template included.",
    category: "educational",
    pillar: "Tools",
    targetKeyword: "grant budget template",
    runtimeSeconds: 708, // ~11:48
    publishedAt: "2026-06-09",
    chapters: [
      { label: "When the numbers don't match the story", seconds: 0 },
      { label: "Why most grant budgets get rejected", seconds: 74 },
      { label: "The line items funders expect", seconds: 117 },
      { label: "Personnel and fringe, the biggest number", seconds: 180 },
      { label: "The other direct costs", seconds: 262 },
      { label: "Indirect costs and the de minimis rate", seconds: 340 },
      { label: "Cost share and match", seconds: 418 },
      { label: "The budget narrative", seconds: 471 },
      { label: "Allowable costs and the spending window", seconds: 537 },
      { label: "Where a budget template breaks", seconds: 591 },
      { label: "Free template + what's next", seconds: 640 },
    ],
    leadMagnetSlug: "grant-budget-template",
    // Embeds on /free/grant-budget-template via leadMagnetSlug (getVideoByLeadMagnet),
    // so no targetPages entry is needed.
    targetPages: [],
  },
  "single-audit": {
    slug: "single-audit",
    youtubeId: "AqnkoZGbJY0",
    title: "The Single Audit Explained: Who Needs One & Why (2024 Rules)",
    shortTitle: "Single Audit Explained",
    description:
      "A plain explanation of what a single audit is, who needs one after the 2024 threshold change, and what auditors test.",
    category: "educational",
    pillar: "Compliance",
    targetKeyword: "single audit",
    runtimeSeconds: 682, // ~11:22
    publishedAt: "2026-06-09",
    chapters: [
      { label: "The threshold that changed in 2024", seconds: 0 },
      { label: "What a single audit actually is", seconds: 52 },
      { label: "Who needs one (and the 2024 threshold)", seconds: 128 },
      { label: 'The word that trips everyone up: "expended"', seconds: 201 },
      { label: "Single audit vs. program-specific audit", seconds: 278 },
      { label: "What the auditor actually tests", seconds: 328 },
      { label: "Findings, questioned costs, and corrective action", seconds: 402 },
      { label: "How and where you file it", seconds: 470 },
      { label: "Where preparing for this breaks down", seconds: 531 },
      { label: "Free checklist + what's next", seconds: 600 },
    ],
    targetPages: ["/grant-compliance-software"],
  },
  "track-restricted-funds": {
    slug: "track-restricted-funds",
    youtubeId: "hvVBvw45iH0",
    title: "How to Track Restricted Funds Correctly",
    shortTitle: "Track Restricted Funds",
    description:
      "What restricted really means, what tracking it takes, and how to keep a balance you can defend.",
    category: "educational",
    pillar: "Operations",
    targetKeyword: "how to track restricted funds",
    runtimeSeconds: 247, // 4:07
    publishedAt: "2026-06-09",
    chapters: [
      { label: "The question a report can't answer", seconds: 0 },
      { label: "What restricted really means", seconds: 43 },
      { label: "What tracking it actually takes", seconds: 81 },
      { label: "Set up the fund", seconds: 114 },
      { label: "See the balance per award", seconds: 143 },
      { label: "Prove the restriction", seconds: 174 },
      { label: "One thing to remember", seconds: 209 },
    ],
    targetPages: ["/restricted-fund-tracking-software"],
  },
  "fund-accounting": {
    slug: "fund-accounting",
    youtubeId: "Q2diz34DEP4",
    title: "What Is Fund Accounting? A Plain-English Guide for Nonprofits",
    shortTitle: "Fund Accounting Explained",
    description:
      "A plain-English explanation of fund accounting and why nonprofits need it to manage restricted money.",
    category: "educational",
    pillar: "Accounting",
    targetKeyword: "what is fund accounting",
    runtimeSeconds: 408, // 6:48
    publishedAt: "2026-06-09",
    chapters: [
      { label: "Two different questions", seconds: 0 },
      { label: "What fund accounting is", seconds: 56 },
      { label: "Why nonprofits need it", seconds: 114 },
      { label: "The building blocks", seconds: 169 },
      { label: "A worked example", seconds: 246 },
      { label: "How it differs from regular accounting", seconds: 310 },
      { label: "One idea to remember", seconds: 361 },
    ],
    targetPages: [],
  },
  "uniform-guidance": {
    slug: "uniform-guidance",
    youtubeId: "3WUKz3HgCM0",
    title: "Uniform Guidance (2 CFR 200) Explained in Plain English",
    shortTitle: "Uniform Guidance Explained",
    description:
      "What 2 CFR Part 200 requires, which four numbers changed in 2024, and what it means for your grants.",
    category: "educational",
    pillar: "Compliance",
    targetKeyword: "uniform guidance 2 cfr 200",
    runtimeSeconds: 336, // 5:36
    publishedAt: "2026-06-09",
    chapters: [
      { label: "One rulebook for federal money", seconds: 0 },
      { label: "What the Uniform Guidance is", seconds: 45 },
      { label: "One rulebook, three jobs", seconds: 91 },
      { label: "The cost test", seconds: 125 },
      { label: "The four numbers that changed in 2024", seconds: 175 },
      { label: "The single audit", seconds: 244 },
      { label: "What to remember", seconds: 293 },
    ],
    targetPages: [],
  },
  "getting-started": {
    slug: "getting-started",
    youtubeId: "3c5Txb_PPW0",
    title: "Getting Started with GrantPipe: Set Up Your Org & Import Your Donors",
    shortTitle: "Getting Started",
    description:
      "How to set up your org and import your donors into GrantPipe in under four minutes.",
    category: "product",
    runtimeSeconds: 225, // 3:45
    publishedAt: "2026-06-09",
    chapters: [
      { label: "The part everyone dreads", seconds: 0 },
      { label: "Set up your org (three fields)", seconds: 27 },
      { label: "Pick what you're importing", seconds: 71 },
      { label: "Upload and preview (nothing saves yet)", seconds: 110 },
      { label: "Commit and read the result", seconds: 141 },
      { label: "You're set up", seconds: 190 },
    ],
    targetPages: [],
  },
  "add-grant-allocate": {
    slug: "add-grant-allocate",
    youtubeId: "Bh9hr-xiCeU",
    title: "Add a Grant in GrantPipe and Split It Across Your Funds",
    shortTitle: "Add a Grant and Allocate",
    description:
      "How to record a new grant in GrantPipe and split it across two or more restricted funds.",
    category: "product",
    runtimeSeconds: 202, // 3:22
    publishedAt: "2026-06-09",
    chapters: [
      { label: "New money, new rules", seconds: 0 },
      { label: "Add the grant", seconds: 31 },
      { label: "The four numbers", seconds: 69 },
      { label: "Split it across funds", seconds: 101 },
      { label: "The guardrail", seconds: 144 },
      { label: "You're set", seconds: 176 },
    ],
    targetPages: [],
  },
};

export const VIDEOS: VideoRecord[] = VIDEO_SLUGS.map((s) => VIDEO_REGISTRY[s]);

export function getVideo(slug: VideoSlug): VideoRecord {
  return VIDEO_REGISTRY[slug];
}

export function getVideosByCategory(category: VideoCategory): VideoRecord[] {
  return VIDEOS.filter((v) => v.category === category);
}

export function getVideoForPage(path: string): VideoRecord | undefined {
  return VIDEOS.find((v) => v.targetPages.includes(path));
}

export function getVideoByLeadMagnet(slug: LeadMagnetSlug): VideoRecord | undefined {
  return VIDEOS.find((v) => v.leadMagnetSlug === slug);
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeEmbedUrl(id: string, opts?: { autoplay?: boolean }): string {
  const base = `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`;
  return opts?.autoplay ? `${base}&autoplay=1` : base;
}

export function youtubeThumbnailUrl(id: string, quality: string = "hqdefault"): string {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}
