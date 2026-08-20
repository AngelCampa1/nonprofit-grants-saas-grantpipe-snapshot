import { getGrantPipePricingCopy } from "../../../../packages/shared/src/pricing";

const pricingCopy = getGrantPipePricingCopy();

const pricingTokenReplacements = new Map([
  ["{{grantpipe.price.starterMonthly}}", pricingCopy.starterMonthly],
  ["{{grantpipe.price.starterAnnual}}", pricingCopy.starterAnnual],
  ["{{grantpipe.price.growthMonthly}}", pricingCopy.growthMonthly],
  ["{{grantpipe.price.growthAnnual}}", pricingCopy.growthAnnual],
  ["{{grantpipe.price.auditReadyMonthly}}", pricingCopy.auditReadyMonthly],
  ["{{grantpipe.price.auditReadyAnnual}}", pricingCopy.auditReadyAnnual],
  ["{{grantpipe.price.selfServeRange}}", pricingCopy.selfServeListRange],
]);

export function resolvePricingCopyTokens(value: string): string {
  let resolved = value;
  for (const [token, replacement] of pricingTokenReplacements) {
    resolved = resolved.replaceAll(token, replacement);
  }

  return resolved;
}

export function resolvePricingCopyTree<T>(value: T): T {
  if (typeof value === "string") {
    return resolvePricingCopyTokens(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolvePricingCopyTree(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entryValue]) => [
      key,
      resolvePricingCopyTree(entryValue),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}
