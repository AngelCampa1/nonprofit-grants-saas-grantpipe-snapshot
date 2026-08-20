import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAN_CATALOG,
  TRIAL_EFFECTIVE_PLAN_TIER,
  formatCurrencyCents,
  getGrantPipePricingCopy,
  getMinimumPlanForFeatures,
} from "../../../../packages/shared/src/pricing";
import { marketingContentDirectory } from "../lib/marketing-content-root";

const contentRoot = marketingContentDirectory;

function listMarkdownFiles(dir: string): string[] {
  return listFilesByExtension(dir, [".md", ".mdx"]);
}

function listFilesByExtension(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFilesByExtension(full, extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      out.push(full);
    }
  }
  return out;
}

const allMarkdown = listMarkdownFiles(contentRoot);

const validMonthlyDollars = new Set(
  PLAN_CATALOG.flatMap((plan) => (plan.prices ? [Math.round(plan.prices.monthlyCents / 100)] : [])),
);

const validAnnualEquivalentDollars = new Set(
  PLAN_CATALOG.flatMap((plan) =>
    plan.prices ? [Math.round(plan.prices.annualMonthlyEquivalentCents / 100)] : [],
  ),
);

const allValidGrantPipeDollars = new Set<number>([
  ...validMonthlyDollars,
  ...validAnnualEquivalentDollars,
]);
const grantPipeOwnedDollars = [
  159, 179, 199, 299, 399, 499, 599, 799, 1329, 1599, 1788, 1980, 2988, 3990, 5988, 7980, 9588,
  14364, 17964,
];
const allowedGrantPipePriceValues = new Set(
  Object.values(getGrantPipePricingCopy()).filter(
    (value): value is string => typeof value === "string",
  ),
);

const knownTierLabels = new Set(PLAN_CATALOG.map((plan) => plan.name.toLowerCase()));
const removedTierLabels = ["pro", "team", "business"];

// Requires the price to be attributed to GrantPipe or one of its tiers,
// avoiding budget ranges and competitor prices that appear earlier in the line.
const grantpipeOwnPriceRegex = new RegExp(
  String.raw`grantpipe(?:'s)?` +
    String.raw`(?:\s*\([^)]*)?` +
    String.raw`(?:\s+(?:starter|growth|audit[- ]ready|enterprise))?` +
    String.raw`(?:\s+(?:tier|plan))?` +
    String.raw`(?:[^.\n]{0,40}?\b(?:at|costs?|is|=|priced\s+at|starts?\s+at|lists?\s+at|runs?|with|from))?` +
    String.raw`[^.\n]{0,20}?~?\$(\d{2,4})(?:\s*-\s*\$(\d{2,4}))?(?:\s*\/\s*(?:mo|month)|\s+per\s+month|\s+monthly)\b`,
  "gi",
);

describe("GrantPipe tier-copy contract", () => {
  it("rejects hardcoded GrantPipe-owned prices in markdown bodies", () => {
    const violations: string[] = [];

    for (const file of allMarkdown) {
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      let grantPipeSectionDepth: number | null = null;
      lines.forEach((line, lineIdx) => {
        if (line.includes("{{grantpipe.")) return;
        const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
        if (headingMatch) {
          const headingDepth = headingMatch[1]?.length ?? 0;
          const headingText = headingMatch[2] ?? "";
          if (/grantpipe/i.test(headingText)) {
            grantPipeSectionDepth = headingDepth;
          } else if (grantPipeSectionDepth !== null && headingDepth <= grantPipeSectionDepth) {
            grantPipeSectionDepth = null;
          }
        }

        const localRegex = new RegExp(grantpipeOwnPriceRegex.source, "gi");
        let match: RegExpExecArray | null;
        while ((match = localRegex.exec(line)) !== null) {
          const dollars = Number.parseInt(match[1] ?? "0", 10);
          if (Number.isNaN(dollars)) continue;
          if (allValidGrantPipeDollars.has(dollars)) {
            violations.push(
              `${file}:${lineIdx + 1} - hardcoded GrantPipe-owned $${dollars}/mo should use a {{grantpipe.price.*}} token or shared pricing helper\n  ${line.trim()}`,
            );
          }
        }

        const lineIsGrantPipeOwned = /grantpipe/i.test(line) || grantPipeSectionDepth !== null;
        if (!lineIsGrantPipeOwned) return;
        for (const dollars of grantPipeOwnedDollars) {
          const literal = `$${dollars.toLocaleString("en-US")}`;
          if (!line.includes(literal)) continue;
          if (!/(?:\/\s*(?:mo|month)|\bper\s+month\b|\bmonthly\b)/i.test(line)) {
            continue;
          }
          const allowedBySharedCopy = [...allowedGrantPipePriceValues].some(
            (value) => value.includes(literal) && line.includes(value),
          );
          if (allowedBySharedCopy) continue;
          violations.push(
            `${file}:${lineIdx + 1} - hardcoded GrantPipe-owned ${literal} should use a {{grantpipe.price.*}} token or shared pricing helper\n  ${line.trim()}`,
          );
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("rejects hardcoded GrantPipe promo terms in markdown bodies", () => {
    const violations: string[] = [];
    const hardcodedPromoPattern = /\b(?:80% off|first 300 customers|for subscriptions only)\b/i;

    for (const file of allMarkdown) {
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        if (line.includes("{{grantpipe.")) return;
        if (!/grantpipe/i.test(line)) return;
        if (!hardcodedPromoPattern.test(line)) return;
        violations.push(
          `${file}:${lineIdx + 1} - retired GrantPipe promo terms should use current pricing copy or a shared pricing helper\n  ${line.trim()}`,
        );
      });
    }

    expect(violations).toEqual([]);
  });

  it("does not advertise tier names that GrantPipe no longer ships", () => {
    const violations: string[] = [];
    for (const file of allMarkdown) {
      const text = readFileSync(file, "utf8").toLowerCase();
      if (!text.includes("grantpipe")) continue;
      for (const removed of removedTierLabels) {
        const pattern = new RegExp(`grantpipe\\s+${removed}\\b`, "i");
        if (pattern.test(text)) {
          violations.push(`${file} mentions removed tier name 'GrantPipe ${removed}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not ship malformed GrantPipe pricing artifacts", () => {
    const malformedPatterns = [
      /\bStarter79\b/i,
      /\bfull platform79\b/i,
      /\bGrowth99\b/i,
      /\bAudit[- ]Ready99\b/i,
    ];
    const violations: string[] = [];

    for (const file of allMarkdown) {
      const text = readFileSync(file, "utf8");
      malformedPatterns.forEach((pattern) => {
        if (pattern.test(text)) {
          violations.push(`${file} contains malformed pricing artifact ${pattern}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("ensures every PLAN_CATALOG plan name is in the canonical tier label set", () => {
    for (const plan of PLAN_CATALOG) {
      expect(knownTierLabels.has(plan.name.toLowerCase())).toBe(true);
    }
  });

  it("formats current monthly prices as expected", () => {
    expect(formatCurrencyCents(32900)).toBe("$329");
    expect(formatCurrencyCents(53900)).toBe("$539");
    expect(formatCurrencyCents(107900)).toBe("$1,079");
  });
});

// The free trial uses the plan the buyer selects. So no GrantPipe-owned copy
// may sell the trial as "full access", "full feature access", "enterprise
// access", or "every feature". Those claims overpromise capabilities the
// selected plan may not unlock. Competitor descriptions ("Some platforms give
// you full access") are not GrantPipe-owned and are left alone.
describe("GrantPipe trial tier-claim guard", () => {
  // Phrases that, attached to GrantPipe's own trial, claim more than the
  // selected plan.
  // "every feature gate" is UI gating, not a promise that every feature is on —
  // so exclude it via lookahead.
  const TRIAL_OVERPROMISE =
    /\b(?:(?:full|complete)\s+(?:feature\s+|enterprise\s+)?access|enterprise(?:-tier)?\s+access|full\s+Audit-Ready\s+feature\s+set|Audit-Ready\s+feature\s+set|every\s+(?:single\s+)?feature(?!\s+gate)|all\s+features|(?:full|complete|entire|whole)\s+(?:platform|product|suite|app)|(?:unlocks?|opens?\s+up|gives?|get)\s+(?:you\s+|the\s+)?everything)\b/i;
  // Trial proxies: the literal word, plus the phrases marketing uses for it.
  // "30 days of full access" never says "trial" but means it — B-1 proved that.
  const MENTIONS_TRIAL = /\b(?:trial|free month|30[\s-]?days?)\b/i;
  // A line that explicitly red-teams or corrects the bad claim ("not enterprise",
  // "is a lie", "doubly wrong", caps "stay behind a founder-contact upgrade") is
  // discussing the violation to fix it, not committing one. Internal strategy
  // docs quote bad claims to refute them; this keeps those clean. Note: bare
  // "audit-ready" is deliberately NOT a skip marker — a sell line that names a
  // plan while ALSO overclaiming ("Audit-Ready trial, full access to every
  // feature") is a real violation and must still be flagged.
  const CORRECTION_CONTEXT =
    /not\s+`?\s*enterprise|doubly wrong|is a lie|stays? behind|founder[\s-]?contact|(?:do not|should not|don't|avoid|never)\s+(?:claim|imply|claiming|implying)/i;

  // A line is GrantPipe-owned when it names GrantPipe, or sits under a GrantPipe
  // heading. Mirrors the ownership test the price sweep above uses. Internal
  // docs are wholly about GrantPipe under one H1, so callers pass assumeOwned.
  function flagOverpromiseLines(text: string, assumeOwned = false): string[] {
    const lines = text.split(/\r?\n/);
    const flagged: string[] = [];
    let grantPipeSectionDepth: number | null = null;
    lines.forEach((line, lineIdx) => {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
      if (headingMatch) {
        const headingDepth = headingMatch[1]?.length ?? 0;
        const headingText = headingMatch[2] ?? "";
        if (/grantpipe/i.test(headingText)) {
          grantPipeSectionDepth = headingDepth;
        } else if (grantPipeSectionDepth !== null && headingDepth <= grantPipeSectionDepth) {
          grantPipeSectionDepth = null;
        }
      }
      const lineIsGrantPipeOwned =
        assumeOwned || /grantpipe/i.test(line) || grantPipeSectionDepth !== null;
      if (!lineIsGrantPipeOwned) return;
      if (!MENTIONS_TRIAL.test(line)) return;
      if (CORRECTION_CONTEXT.test(line)) return;
      if (TRIAL_OVERPROMISE.test(line)) {
        flagged.push(`${lineIdx + 1}: ${line.trim()}`);
      }
    });
    return flagged;
  }

  it("flags a GrantPipe trial line that overpromises tier access", () => {
    expect(
      flagOverpromiseLines("GrantPipe's free trial gives you full enterprise access for 30 days."),
    ).toHaveLength(1);
    expect(
      flagOverpromiseLines("## GrantPipe\nThe trial unlocks every feature, no caps."),
    ).toHaveLength(1);
    // Trial proxy with no literal "trial" word — the B-1 shape.
    expect(
      flagOverpromiseLines("GrantPipe gives you 30 days of full access. No card needed."),
    ).toHaveLength(1);
    // Naming the correct tier does NOT excuse an overpromise on the same line.
    expect(
      flagOverpromiseLines("GrantPipe's Audit-Ready trial unlocks every feature for 30 days."),
    ).toHaveLength(1);
    // Synonyms the first-pass regex missed: "complete access", "entire/whole
    // platform/product", and "everything". Same overpromise, different words.
    expect(
      flagOverpromiseLines("GrantPipe's trial gives you complete access for 30 days."),
    ).toHaveLength(1);
    expect(
      flagOverpromiseLines("## GrantPipe\nThe 30-day trial unlocks the entire platform."),
    ).toHaveLength(1);
    expect(
      flagOverpromiseLines("## GrantPipe\nThe trial opens up the whole product, no caps."),
    ).toHaveLength(1);
    expect(flagOverpromiseLines("GrantPipe's free month unlocks everything.")).toHaveLength(1);
  });

  it("still skips genuine red-team / correction lines that quote the bad claim", () => {
    // Quotes the violation to refute it — carries explicit correction markers.
    expect(
      flagOverpromiseLines(
        "## GrantPipe\nThe old doc claimed the trial gives full enterprise access. That is a lie: it uses the selected plan, not enterprise.",
      ),
    ).toEqual([]);
  });

  it("does not flag accurate or competitor trial copy", () => {
    expect(
      flagOverpromiseLines(
        "GrantPipe offers a 1-month free trial on the plan you choose. No credit card is required.",
      ),
    ).toEqual([]);
    // Competitor description — not GrantPipe-owned.
    expect(flagOverpromiseLines("Some platforms give you full access during the trial.")).toEqual(
      [],
    );
  });

  it("keeps GrantPipe-owned trial copy from overpromising tier access across the corpus", () => {
    const pagesRoot = fileURLToPath(new URL("../pages", import.meta.url));
    const componentsRoot = fileURLToPath(new URL("../components", import.meta.url));

    function listFiles(dir: string, extensions: string[]): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          out.push(...listFiles(full, extensions));
        } else if (extensions.some((ext) => entry.endsWith(ext))) {
          out.push(full);
        }
      }
      return out;
    }

    // docs/offers holds the GTM trial copy (cold emails, ladders, mechanics).
    // B-1 hid there, outside the marketing corpus — so the guard must cover it.
    // These files are wholly GrantPipe-owned under one H1, so assumeOwned.
    const docsOffersRoot = fileURLToPath(new URL("../../../../docs/offers", import.meta.url));

    const userFacingSurfaces = [
      ...allMarkdown,
      ...listFiles(pagesRoot, [".astro"]),
      ...listFiles(componentsRoot, [".astro"]),
    ];
    const internalDocSurfaces = listFiles(docsOffersRoot, [".md"]);

    const violations: string[] = [];
    for (const file of userFacingSurfaces) {
      for (const hit of flagOverpromiseLines(readFileSync(file, "utf8"))) {
        violations.push(`${file}:${hit}`);
      }
    }
    for (const file of internalDocSurfaces) {
      for (const hit of flagOverpromiseLines(readFileSync(file, "utf8"), true)) {
        violations.push(`${file}:${hit}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps offer strategy docs aligned to the shipped trial tier", () => {
    const offerDocsRoot = fileURLToPath(new URL("../../../../docs/offers", import.meta.url));
    const offerDocs = listMarkdownFiles(offerDocsRoot);

    expect(TRIAL_EFFECTIVE_PLAN_TIER).toBe("starter");
    const violations: string[] = [];
    const staleTrialTierClaims = [
      /\btrial\s*=\s*Audit-Ready access\b/i,
      /\bTrial tier\s*=\s*Audit-Ready access\b/i,
      /\bFull Audit-Ready\b[^.\n]{0,120}\baccess for 30 days\b/i,
      /\bAudit-Ready access,\s*30 days\b/i,
      /\btrial puts you on our Audit-Ready plan for 30 days\b/i,
      /\b30 days on the Audit-Ready plan\b/i,
      /TRIAL_EFFECTIVE_PLAN_TIER`?\s*=\s*`?"audit_ready"`?/i,
      /TRIAL_EFFECTIVE_PLAN_TIER`?\s*=\s*`?audit_ready`?/i,
    ];

    for (const file of offerDocs) {
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        if (staleTrialTierClaims.some((pattern) => pattern.test(line))) {
          violations.push(`${file}:${lineIdx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(readFileSync(join(offerDocsRoot, "productization-system.md"), "utf8")).toContain(
      'TRIAL_EFFECTIVE_PLAN_TIER = "starter"',
    );
    expect(violations).toEqual([]);
  });

  it("does not place guided import support below Audit-Ready", () => {
    const pagesRoot = fileURLToPath(new URL("../lib", import.meta.url));
    const pageSurfacesRoot = fileURLToPath(new URL("../pages", import.meta.url));
    const componentSurfacesRoot = fileURLToPath(new URL("../components", import.meta.url));
    const docsOffersRoot = fileURLToPath(new URL("../../../../docs/offers", import.meta.url));
    const surfaces = [
      ...allMarkdown,
      ...listMarkdownFiles(docsOffersRoot),
      ...listFilesByExtension(pagesRoot, [".ts"]),
      ...listFilesByExtension(pageSurfacesRoot, [".astro"]),
      ...listFilesByExtension(componentSurfacesRoot, [".astro", ".tsx"]),
    ];
    const violations: string[] = [];
    const lowerTierOrTrialContext =
      /\b(?:starter|growth|starting at|every plan|all plans|trial|free month|1-month free trial)\b/i;
    const guidedImportClaim = /\bguided (?:import support|import help|onboarding|setup)\b/i;

    for (const file of surfaces) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        const shouldUseNearbyContext =
          file.includes(`${join("apps", "site", "src", "pages")}`) ||
          file.includes(`${join("apps", "site", "src", "components")}`);
        const context = shouldUseNearbyContext
          ? lines.slice(Math.max(0, lineIdx - 3), lineIdx + 1).join(" ")
          : line;
        if (
          guidedImportClaim.test(line) &&
          lowerTierOrTrialContext.test(context) &&
          !/\bAudit-Ready\b/i.test(context)
        ) {
          violations.push(`${file}:${lineIdx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("does not make guided setup sound like the default GrantPipe setup model", () => {
    const pagesRoot = fileURLToPath(new URL("../pages", import.meta.url));
    const libRoot = fileURLToPath(new URL("../lib", import.meta.url));
    const publicSurfaces = [
      ...allMarkdown,
      ...listFilesByExtension(pagesRoot, [".astro"]),
      ...listFilesByExtension(libRoot, [".ts"]),
    ];
    const violations: string[] = [];
    const broadGuidedSetupClaim =
      /\b(?:GrantPipe[^.\n]{0,180}\bguided (?:onboarding|setup)|guided (?:onboarding|setup)[^.\n]{0,180}\bGrantPipe|GrantPipe Growth[^.\n]{0,240}\bGuided import support|self-(?:managed|serve) with guided onboarding|guided setup, it removes|We'll help import|We offer data migration(?: assistance)?|guided onboarding with data import tools)\b/i;
    const scopedGuidedSetupContext =
      /\b(?:Audit-Ready|Enterprise|founder-led|founder setup|guided data import tools?|guided import tools?|guided import wizard|plan-fit onboarding|supports CSV imports|staff-led setup)\b/i;

    for (const file of publicSurfaces) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        const nearbyContext = lines.slice(Math.max(0, lineIdx - 8), lineIdx + 1).join(" ");
        const lowerTierGuidedImportSupport =
          /\bGuided import support\b/i.test(line) &&
          /\b(?:GrantPipe Growth|Growth)\b/i.test(nearbyContext) &&
          !/\bAudit-Ready\b/i.test(nearbyContext);
        if (
          (broadGuidedSetupClaim.test(line) || lowerTierGuidedImportSupport) &&
          !scopedGuidedSetupContext.test(line)
        ) {
          violations.push(`${file}:${lineIdx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("does not market Starter capabilities as Growth-only additions", () => {
    const violations: string[] = [];
    const growthAddsStarterReminders =
      /\bGrowth\b[^.\n]{0,180}\b(?:adds|includes|covers|handles|Everything in Starter, plus)\b[^.\n]{0,180}\bautomated deadline reminders\b/i;

    for (const file of allMarkdown) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        if (growthAddsStarterReminders.test(line)) {
          violations.push(`${file}:${lineIdx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("does not claim every plan has the Growth compliance report pack", () => {
    const violations: string[] = [];
    const overbroadComplianceReports =
      /\b(?:every plan|all plans)\b[^.\n]{0,160}\b(?:generates?|includes?)\b[^.\n]{0,160}\bcompliance report(?:ing|s)?\b/i;

    for (const file of allMarkdown) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        if (overbroadComplianceReports.test(line)) {
          violations.push(`${file}:${lineIdx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it("scopes AI limit claims to the tools that actually have unlimited caps", () => {
    const pricingSource = readFileSync(
      fileURLToPath(new URL("../../../../packages/shared/src/pricing.ts", import.meta.url)),
      "utf8",
    );

    expect(pricingSource).not.toMatch(/\buse AI without limits\b/i);
    expect(pricingSource).not.toMatch(/\bunlimited AI\b(?! Award Document Intake)/i);
    expect(pricingSource).toContain("Unlimited AI Award Document Intake");
    expect(pricingSource).toContain("Unlimited Ask-Your-Ledger reporting");
  });
});

// Scan .astro pages for hardcoded plan prices — same contract as markdown
describe("GrantPipe tier-copy contract — Astro pages", () => {
  const pagesRoot = fileURLToPath(new URL("../pages", import.meta.url));

  function listAstroFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        out.push(...listAstroFiles(full));
      } else if (entry.endsWith(".astro")) {
        out.push(full);
      }
    }
    return out;
  }

  const allAstro = listAstroFiles(pagesRoot);

  it("rejects hardcoded GrantPipe price strings in Astro pages that disagree with PLAN_CATALOG", () => {
    const violations: string[] = [];
    // Match literal dollar amounts in string literals adjacent to a tier name
    // e.g. "Audit-Ready - $799/mo", "Start Growth - $399/mo"
    // Template literal expressions like `${getPlanDisplayPrice(...)}` are fine — they won't match

    for (const file of allAstro) {
      const text = readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      lines.forEach((line, lineIdx) => {
        // Only flag lines inside quoted strings (not template literals or JS expressions)
        // Check for "$NNN/mo" appearing in a single/double-quoted string
        const quotedPriceRegex =
          /["'][^"']*(?:starter|growth|audit[- ]ready|enterprise)[^"']*\$(\d{2,4})\/mo[^"']*["']/gi;
        let match: RegExpExecArray | null;
        while ((match = quotedPriceRegex.exec(line)) !== null) {
          const dollars = Number.parseInt(match[1] ?? "0", 10);
          if (Number.isNaN(dollars)) continue;
          // Only flag prices that match a known GrantPipe tier price — those are drift risks
          // because they should be derived from PLAN_CATALOG via getPlanDisplayPrice().
          // Unknown prices (e.g. competitor quotes) are fine in quoted strings.
          if (allValidGrantPipeDollars.has(dollars)) {
            violations.push(
              `${file}:${lineIdx + 1} - hardcoded plan price $${dollars}/mo should be derived from PLAN_CATALOG via getPlanDisplayPrice()\n  ${line.trim()}`,
            );
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });
});

// Source-derived sweep: scan the whole marketing corpus (markdown + Astro pages)
// for any copy that attaches a tier-gated capability to a plan that does not
// include it. The forbidden tiers are derived from PLAN_ENTITLEMENTS via
// getMinimumPlanForFeatures, so this self-updates when a capability moves tiers.
describe("GrantPipe tier-capability boundary sweep", () => {
  const pagesRoot = fileURLToPath(new URL("../pages", import.meta.url));

  function listAstroFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        out.push(...listAstroFiles(full));
      } else if (entry.endsWith(".astro")) {
        out.push(full);
      }
    }
    return out;
  }

  const corpus = [...allMarkdown, ...listAstroFiles(pagesRoot)];
  const corpusLineEntries = corpus.map((file) => ({
    file,
    lines: readFileSync(file, "utf8").split(/\r?\n/),
  }));

  const BOUNDARY_CAPABILITIES = [
    {
      feature: "hasCrossEntityReportBuilder",
      aliases: [/cross-?entity report builder/i, /\breport builder\b/i],
    },
    {
      feature: "hasProposalReportDrafting",
      aliases: [/proposal (?:and|&|\/) report drafting/i, /report drafting assistant/i],
    },
    { feature: "hasAuditorFunderPortal", aliases: [/auditor (?:and|&) funder portal/i] },
    { feature: "hasSubrecipientMonitoring", aliases: [/subrecipient monitoring/i] },
    { feature: "hasGuidedOnboarding", aliases: [/guided onboarding/i] },
    { feature: "hasAskYourLedger", aliases: [/ask-your-ledger/i, /\bask ledger\b/i] },
    { feature: "hasIndirectCostRules", aliases: [/indirect cost rules?/i] },
    {
      feature: "hasPaymentEvidencePackage",
      aliases: [/reimbursement evidence packets?/i],
    },
    {
      feature: "hasGrantBudgetExports",
      aliases: [/budget-vs-actual exports?/i],
    },
  ] as const;

  const TIER_ORDER = PLAN_CATALOG.map((plan) => plan.tier);
  const TIER_WORD: Record<string, RegExp> = {
    starter: /\bstarter\b/i,
    growth: /\bgrowth\b/i,
    audit_ready: /\baudit[- ]ready\b/i,
    enterprise: /\benterprise\b/i,
  };
  const TIER_LABEL: Record<string, string> = {
    starter: "Starter",
    growth: "Growth",
    audit_ready: "Audit-Ready",
    enterprise: "Enterprise",
  };

  // Sentences that deny a capability ("Growth does not include X") are not drift.
  const NEGATION = /\b(?:do(?:es)?\s+not|not\s+include|cannot|won't|without|excludes?)\b/i;

  // A tier word followed by a product-category noun ("Enterprise platforms",
  // "Growth-grade software") is generic English naming a class of competitor
  // products, not a reference to a GrantPipe plan. Don't read it as a tier claim.
  const GENERIC_TIER_FOLLOWER =
    /^[\s-]+(?:platforms?|software|tools?|vendors?|solutions?|systems?|suites?|grade)\b/i;
  function namesAPlan(sentence: string, matchIndex: number, matchLength: number): boolean {
    return !GENERIC_TIER_FOLLOWER.test(sentence.slice(matchIndex + matchLength));
  }

  // Find the first tier word in a sentence that is acting as the SUBJECT (owner)
  // of the sentence, ignoring "Everything in <Tier>" baseline references — those
  // name a lower tier only to inherit it into the higher tier being described.
  function firstOwnerTier(sentence: string): { tier: string; index: number } | null {
    let best: { tier: string; index: number } | null = null;
    for (const tier of TIER_ORDER) {
      const match = TIER_WORD[tier]!.exec(sentence);
      if (!match) continue;
      if (!namesAPlan(sentence, match.index, match[0].length)) continue; // generic word, not a plan
      const before = sentence.slice(0, match.index).toLowerCase();
      if (/everything in\s+$/.test(before)) continue; // baseline reference, not the owner
      if (best === null || match.index < best.index) {
        best = { tier, index: match.index };
      }
    }
    return best;
  }

  // Tiers a sentence presents as INCLUDING something, ignoring baseline references.
  function includingTiers(sentence: string): string[] {
    return TIER_ORDER.filter((tier) => {
      const match = TIER_WORD[tier]!.exec(sentence);
      if (!match) return false;
      if (!namesAPlan(sentence, match.index, match[0].length)) return false; // generic word, not a plan
      const before = sentence.slice(0, match.index).toLowerCase();
      return !/everything in\s+$/.test(before);
    });
  }

  it("never attaches a tier-gated capability to a plan below its minimum tier", () => {
    const violations: string[] = [];

    for (const { feature, aliases } of BOUNDARY_CAPABILITIES) {
      const minPlan = getMinimumPlanForFeatures([feature as never]);
      const minIdx = TIER_ORDER.indexOf(minPlan);
      const forbiddenTiers = new Set<string>(TIER_ORDER.slice(0, minIdx));
      if (forbiddenTiers.size === 0) continue;

      for (const { file, lines } of corpusLineEntries) {
        lines.forEach((line, lineIdx) => {
          if (!aliases.some((alias) => alias.test(line))) return;
          // Split a line into sentences/clauses so multi-tier description lines
          // attribute each capability to the tier that actually owns it.
          const sentences = line.split(/(?<=[.;:])\s+|\s*\|\s*/);
          for (const sentence of sentences) {
            const aliasIdx = aliases
              .map((alias) => alias.exec(sentence)?.index ?? -1)
              .filter((i) => i >= 0)
              .sort((a, b) => a - b)[0];
            if (aliasIdx === undefined) continue;
            if (NEGATION.test(sentence)) continue;

            const owner = firstOwnerTier(sentence);
            let candidates: string[];
            if (owner && aliasIdx > owner.index) {
              // "<Tier> adds <capability>" — the leading tier owns the clause.
              candidates = [owner.tier];
            } else {
              // "<Capability> is on <Tier, Tier>" — every included tier is claimed.
              candidates = includingTiers(sentence);
            }

            for (const tier of candidates) {
              if (!forbiddenTiers.has(tier)) continue;
              violations.push(
                `${file}:${lineIdx + 1} - copy attaches ${feature} to ${TIER_LABEL[tier]}, but it is gated to ${TIER_LABEL[minPlan]} and above\n  ${sentence.trim()}`,
              );
            }
          }
        });
      }
    }

    expect(violations).toEqual([]);
  }, 30000);

  // Mirror image of the test above. The forbidden-tier sweep catches copy that
  // attaches a capability to a tier BELOW its minimum. This one catches the
  // opposite mistake: copy that lists only tiers ABOVE the minimum and so omits
  // the tier that actually unlocks it (e.g. "Audit-Ready and Enterprise include
  // QuickBooks" when QuickBooks ships from Growth). A paying Growth customer
  // reading that is wrongly told to buy up two tiers. Derived from entitlements,
  // so it self-updates when a capability moves tiers.
  it("never under-attributes a tier-gated capability by listing only tiers above its minimum", () => {
    const violations: string[] = [];

    for (const { feature, aliases } of BOUNDARY_CAPABILITIES) {
      const minPlan = getMinimumPlanForFeatures([feature as never]);
      const minIdx = TIER_ORDER.indexOf(minPlan);

      for (const { file, lines } of corpusLineEntries) {
        lines.forEach((line, lineIdx) => {
          if (!aliases.some((alias) => alias.test(line))) return;
          const sentences = line.split(/(?<=[.;:])\s+|\s*\|\s*/);
          for (const sentence of sentences) {
            const aliasIdx = aliases
              .map((alias) => alias.exec(sentence)?.index ?? -1)
              .filter((i) => i >= 0)
              .sort((a, b) => a - b)[0];
            if (aliasIdx === undefined) continue;
            if (NEGATION.test(sentence)) continue;

            const owner = firstOwnerTier(sentence);
            let claimedTiers: string[];
            if (owner && aliasIdx > owner.index) {
              // "<Tier> adds <capability>" — the clause claims the capability
              // starts at that single tier.
              claimedTiers = [owner.tier];
            } else {
              // "<Capability> is on <Tier, Tier>" — only an enumeration of two or
              // more tiers reliably asserts the full set; a single bare tier
              // mention ("Enterprise includes X") is not an exclusivity claim.
              const included = includingTiers(sentence);
              if (included.length < 2) continue;
              claimedTiers = included;
            }

            const lowestClaimedIdx = Math.min(
              ...claimedTiers.map((tier) =>
                TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]),
              ),
            );
            if (lowestClaimedIdx > minIdx) {
              violations.push(
                `${file}:${lineIdx + 1} - copy starts ${feature} at ${TIER_LABEL[TIER_ORDER[lowestClaimedIdx]!]}, but it is available from ${TIER_LABEL[minPlan]}\n  ${sentence.trim()}`,
              );
            }
          }
        });
      }
    }

    expect(violations).toEqual([]);
  }, 30000);
});
