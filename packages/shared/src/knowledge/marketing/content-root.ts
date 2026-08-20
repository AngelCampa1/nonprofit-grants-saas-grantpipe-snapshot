import type { MarketingContentCollection } from "../types";

export function getMarketingContentRepositoryRoot(): string {
  return "packages/shared/src/knowledge/marketing/content";
}

export function getMarketingContentCollectionBase(collection: MarketingContentCollection): string {
  return `../../packages/shared/src/knowledge/marketing/content/${collection}`;
}
