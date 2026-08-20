// Schema files are added per-domain in Phase 2+.
// Each domain (auth, donors, grants, etc.) gets its own file in this directory.
// This index re-exports all tables for Drizzle Kit to discover.

export * from "./auth";
export * from "./contacts";
export * from "./grants";
export * from "./compliance";
export * from "./events";
export * from "./infrastructure";
export * from "./accounting";
export * from "./programs";
export * from "./restrictions";
export * from "./external-reviewers";
export * from "./payments";
export * from "./document-extractions";
export * from "./subrecipients";
export * from "./trial-usage";
export * from "./pledges";
export * from "./allocation";
export * from "./outcomes";
export * from "./sample-data";
export * from "./ai-usage-events";
