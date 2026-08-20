import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function expectGateFailure(path: string, pattern: RegExp) {
  try {
    execFileSync("node", ["scripts/linkedin-post-review-gate.mjs", path], {
      encoding: "utf8",
    });
  } catch (error: unknown) {
    const processError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    expect(
      [processError.stdout, processError.stderr, processError.message].filter(Boolean).join("\n"),
    ).toMatch(pattern);
    return;
  }

  throw new Error("Expected LinkedIn post review gate to fail");
}

describe("LinkedIn post review gate CLI", () => {
  it("keeps the writer brief aligned with the publish gate", () => {
    const brief = readFileSync("docs/social/linkedin/WRITER-BRIEF.md", "utf8");

    expect(brief).not.toMatch(/no email required/i);
    expect(brief).not.toMatch(/image suggestion/i);
    expect(brief).not.toMatch(/\$269\/mo|\$449\/mo|\$899\/mo|\$468\/yr|\$5,389\/yr|\$1,908\/yr/);
    expect(brief).not.toMatch(/limited offer: 80% off/i);
  });

  it("reviews schedule-manifest JSON items that store post body in text", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const manifestPath = join(dir, "schedule-manifest.json");

    writeFileSync(
      manifestPath,
      JSON.stringify([
        {
          id: "2026-05-21-post-01",
          kind: "post",
          text: "Grant reporting breaks when restricted fund balances live in a spreadsheet.",
          metadata: {
            review_status: "ready_to_schedule",
            humanizer_status: "passed",
            claim_sources: ["docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md"],
          },
          status: "pending",
        },
      ]),
    );

    expect(() =>
      execFileSync("node", ["scripts/linkedin-post-review-gate.mjs", manifestPath], {
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("rejects failed JSON metadata even when the post body is clean", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const manifestPath = join(dir, "schedule-manifest.json");

    writeFileSync(
      manifestPath,
      JSON.stringify([
        {
          id: "2026-05-21-post-02",
          text: "Restricted fund reports should connect the grant, donor, and release entry.",
          metadata: {
            review_status: "failed",
            humanizer_status: "passed",
            claim_sources: ["docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md"],
          },
        },
      ]),
    );

    expectGateFailure(manifestPath, /review_status is failed/);
  });

  it("rejects failed JSONL top-level metadata fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const manifestPath = join(dir, "schedule-manifest.jsonl");

    writeFileSync(
      manifestPath,
      `${JSON.stringify({
        id: "2026-05-21-post-03",
        text: "Compliance work is easier when each report ties back to the award file.",
        review_status: "approved",
        humanizer_status: "failed",
        claim_sources: ["docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md"],
      })}\n`,
    );

    expectGateFailure(manifestPath, /humanizer_status is failed/);
  });

  it("rejects CSV metadata columns that fail review requirements", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const manifestPath = join(dir, "schedule-manifest.csv");

    writeFileSync(
      manifestPath,
      [
        "id,text,review_status,humanizer_status,claim_sources",
        '"2026-05-21-post-04","Award files should keep budgets, amendments, and reports connected.","approved","passed",""',
      ].join("\n"),
    );

    expectGateFailure(manifestPath, /claim_sources must be a non-empty array/);
  });

  it("rejects Postiz JSONL posts without required review metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const manifestPath = join(dir, "schedule-manifest.jsonl");

    writeFileSync(
      manifestPath,
      `${JSON.stringify({
        id: "2026-05-21-post-05",
        postsAndComments: [
          {
            content:
              "Federal grant reporting works better when every reimbursement threshold maps back to source documentation.",
          },
        ],
      })}\n`,
    );

    expectGateFailure(
      manifestPath,
      /missing review_status[\s\S]*missing humanizer_status[\s\S]*missing claim_sources/,
    );
  });

  it("allows plain text source posts without structured review metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const postPath = join(dir, "post.txt");

    writeFileSync(
      postPath,
      "Grant reports are easier to defend when every expense maps back to an award file.",
    );

    expect(() =>
      execFileSync("node", ["scripts/linkedin-post-review-gate.mjs", postPath], {
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("rejects hardcoded GrantPipe pricing amounts in post bodies", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const postPath = join(dir, "post.txt");

    writeFileSync(
      postPath,
      "GrantPipe Growth plan: $79/mo billed annually. Public pricing at grantpipe.com/pricing.",
    );

    expectGateFailure(postPath, /hardcoded GrantPipe pricing/);
  });

  it("rejects tier colon prices and annual price literals", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const postPath = join(dir, "post.txt");

    writeFileSync(
      postPath,
      "Starter: $39/mo billed annually. Growth: $79/mo. Audit Ready: $159/mo. Annual is $468/yr.",
    );

    expectGateFailure(postPath, /hardcoded GrantPipe pricing/);
  });

  it("rejects hardcoded GrantPipe promo terms in post bodies", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const postPath = join(dir, "post.txt");

    writeFileSync(postPath, "Limited offer: 80% off your first year. First 300 customers.");

    expectGateFailure(postPath, /hardcoded GrantPipe promo terms/);
  });

  it("rejects no-email-required lead magnet CTAs", () => {
    const dir = mkdtempSync(join(tmpdir(), "grantpipe-linkedin-gate-"));
    const postPath = join(dir, "post.txt");

    writeFileSync(postPath, "The 2 CFR 200 Audit Prep Checklist. PDF, no email required.");

    expectGateFailure(postPath, /no\\s\+email\\s\+required/);
  });
});
