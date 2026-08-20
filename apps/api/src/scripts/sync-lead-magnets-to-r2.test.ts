import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEAD_MAGNET_SLUGS,
  PROMOTED_PDF_LEAD_MAGNET_SLUGS,
  leadMagnetAsset,
} from "@grantpipe/shared";

const { execSyncMock, existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

import {
  buildVerifyLeadMagnetCommand,
  readLeadMagnetManifest,
  run,
  runCli,
  runWranglerCommand,
  verifyLeadMagnetsInR2,
  SCRIPT_PATH,
  syncLeadMagnetsToR2,
  validateManifestEntries,
  type LeadMagnetManifestEntry,
} from "./sync-lead-magnets-to-r2";

function makeEntry(overrides: Partial<LeadMagnetManifestEntry> = {}): LeadMagnetManifestEntry {
  return {
    slug: "grant-compliance-checklist",
    title: "Grant Compliance Checklist",
    sourcePath: "/repo/apps/site/src/content/lead-magnets/grant-compliance-checklist.md",
    outputPath: "/repo/apps/site/.lead-magnet-pdfs/grant-compliance-checklist.pdf",
    fileName: "grant-compliance-checklist.pdf",
    r2Key: "lead-magnets/grant-compliance-checklist.pdf",
    assetType: "pdf",
    promoted: true,
    publishedAt: "2026-01-01",
    ...overrides,
  };
}

function makeSheetEntry(overrides: Partial<LeadMagnetManifestEntry> = {}): LeadMagnetManifestEntry {
  return makeEntry({
    slug: "grant-tracking-template",
    title: "Grant Tracking Spreadsheet",
    sourcePath: "/repo/apps/site/src/assets/lead-magnets/grant-tracking-template.xlsx",
    outputPath: "/repo/apps/site/.lead-magnet-pdfs/grant-tracking-template.xlsx",
    fileName: "grant-tracking-template.xlsx",
    r2Key: "lead-magnets/grant-tracking-template.xlsx",
    assetType: "xlsx",
    promoted: false,
    ...overrides,
  });
}

function makeSlugEntry(slug: string): LeadMagnetManifestEntry {
  const asset = leadMagnetAsset(slug);
  return makeEntry({
    slug,
    title: `Title for ${slug}`,
    outputPath: `/repo/apps/site/.lead-magnet-pdfs/${slug}.${asset.extension}`,
    fileName: `${slug}.${asset.extension}`,
    r2Key: asset.r2Key,
    assetType: asset.extension,
    promoted: (PROMOTED_PDF_LEAD_MAGNET_SLUGS as ReadonlyArray<string>).includes(slug),
  });
}

function makeAssetBytes(slug: string): Buffer {
  return leadMagnetAsset(slug).extension === "xlsx" ? makeXlsxBytes() : makePdfBytes();
}

function makePdfBytes(size = 12 * 1024): Buffer {
  const bytes = Buffer.alloc(size, " ");
  bytes.write("%PDF-1.7\n", 0, "utf-8");
  bytes.write("\n%%EOF\n", size - 8, "utf-8");
  return bytes;
}

function makeXlsxBytes(size = 12 * 1024): Buffer {
  const bytes = Buffer.alloc(size, " ");
  // xlsx files are ZIP archives beginning with the local file header "PK\x03\x04".
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  return bytes;
}

beforeEach(() => {
  execSyncMock.mockReset();
  existsSyncMock.mockReset();
  readFileSyncMock.mockReset();
});

describe("readLeadMagnetManifest", () => {
  it("parses the manifest JSON", () => {
    const entries = readLeadMagnetManifest({
      manifestPath: "/tmp/manifest.json",
      readFile: () => JSON.stringify([makeEntry()]),
    });

    expect(entries).toEqual([makeEntry()]);
  });

  it("throws a clear error when the manifest is missing", () => {
    expect(() =>
      readLeadMagnetManifest({
        manifestPath: "/tmp/missing.json",
        readFile: () => {
          throw new Error("missing");
        },
      }),
    ).toThrow("Could not read lead magnet manifest");
  });

  it("fails when manifest JSON is not an array", () => {
    expect(() =>
      readLeadMagnetManifest({
        manifestPath: "/tmp/manifest.json",
        readFile: () => JSON.stringify({ entries: [makeEntry()] }),
      }),
    ).toThrow("Lead magnet manifest must be an array");
  });
});

describe("validateManifestEntries", () => {
  it("accepts valid manifest entries with expected keys and existing files", () => {
    expect(() =>
      validateManifestEntries([makeEntry()], {
        fileExists: () => true,
        promotedSlugs: ["grant-compliance-checklist"],
        requiredSlugs: ["grant-compliance-checklist"],
      }),
    ).not.toThrow();
  });

  it("fails when an entry has an unexpected R2 key", () => {
    expect(() =>
      validateManifestEntries([makeEntry({ r2Key: "lead-magnets/bad-key.pdf" })], {
        fileExists: () => true,
        promotedSlugs: ["grant-compliance-checklist"],
        requiredSlugs: ["grant-compliance-checklist"],
      }),
    ).toThrow("Unexpected R2 key");
  });

  it("accepts an xlsx entry with the per-asset .xlsx R2 key", () => {
    expect(() =>
      validateManifestEntries([makeSheetEntry()], {
        fileExists: () => true,
        promotedSlugs: [],
        requiredSlugs: ["grant-tracking-template"],
      }),
    ).not.toThrow();
  });

  it("fails when an xlsx entry uses a .pdf R2 key", () => {
    expect(() =>
      validateManifestEntries(
        [makeSheetEntry({ r2Key: "lead-magnets/grant-tracking-template.pdf" })],
        {
          fileExists: () => true,
          promotedSlugs: [],
          requiredSlugs: ["grant-tracking-template"],
        },
      ),
    ).toThrow("Unexpected R2 key");
  });

  it("fails when the manifest is empty", () => {
    expect(() =>
      validateManifestEntries([], {
        fileExists: () => true,
        promotedSlugs: [],
        requiredSlugs: [],
      }),
    ).toThrow("Lead magnet manifest is empty");
  });

  it("fails when the local PDF is missing", () => {
    expect(() =>
      validateManifestEntries([makeEntry()], {
        fileExists: () => false,
        promotedSlugs: ["grant-compliance-checklist"],
        requiredSlugs: ["grant-compliance-checklist"],
      }),
    ).toThrow("Missing local PDF");
  });

  it("fails when a promoted slug is absent from the manifest", () => {
    expect(() =>
      validateManifestEntries([makeEntry()], {
        fileExists: () => true,
        promotedSlugs: [...PROMOTED_PDF_LEAD_MAGNET_SLUGS],
        requiredSlugs: ["grant-compliance-checklist"],
      }),
    ).toThrow("Missing promoted PDF manifests");
  });

  it("fails when promoted entries disappear between validations", () => {
    const fileExists = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);

    expect(() =>
      validateManifestEntries([makeEntry()], {
        fileExists,
        promotedSlugs: ["grant-compliance-checklist"],
        requiredSlugs: ["grant-compliance-checklist"],
      }),
    ).toThrow("Missing local PDFs for promoted magnets");
  });

  it("accepts a manifest that covers every promoted slug", () => {
    expect(() =>
      validateManifestEntries(LEAD_MAGNET_SLUGS.map(makeSlugEntry), {
        fileExists: () => true,
        promotedSlugs: [...PROMOTED_PDF_LEAD_MAGNET_SLUGS],
        requiredSlugs: [...LEAD_MAGNET_SLUGS],
      }),
    ).not.toThrow();
  });

  it("uses the shared promoted slug defaults when no override is provided", () => {
    const entries = LEAD_MAGNET_SLUGS.map(makeSlugEntry);

    expect(() =>
      validateManifestEntries(entries, {
        fileExists: () => true,
      }),
    ).not.toThrow();
  });

  it("requires every supported lead magnet by default", () => {
    expect(() =>
      validateManifestEntries(
        [
          makeEntry(),
          makeEntry({
            slug: "nonprofit-crm-evaluation-scorecard",
            title: "CRM Evaluation Scorecard",
            outputPath: "/repo/apps/site/.lead-magnet-pdfs/nonprofit-crm-evaluation-scorecard.pdf",
            fileName: "nonprofit-crm-evaluation-scorecard.pdf",
            r2Key: "lead-magnets/nonprofit-crm-evaluation-scorecard.pdf",
            promoted: true,
          }),
          makeEntry({
            slug: "donor-retention-playbook",
            title: "Donor Retention Playbook",
            outputPath: "/repo/apps/site/.lead-magnet-pdfs/donor-retention-playbook.pdf",
            fileName: "donor-retention-playbook.pdf",
            r2Key: "lead-magnets/donor-retention-playbook.pdf",
            promoted: true,
          }),
        ],
        {
          fileExists: () => true,
        },
      ),
    ).toThrow("Missing supported PDF manifests");
  });
});

describe("syncLeadMagnetsToR2", () => {
  it("uploads each manifest entry to its expected bucket key", () => {
    const exec = vi.fn();
    syncLeadMagnetsToR2({
      bucket: "grantpipe-documents",
      entries: [
        makeEntry(),
        makeEntry({
          slug: "donor-retention-playbook",
          title: "Donor Retention Playbook",
          outputPath: "/repo/apps/site/.lead-magnet-pdfs/donor-retention-playbook.pdf",
          fileName: "donor-retention-playbook.pdf",
          r2Key: "lead-magnets/donor-retention-playbook.pdf",
        }),
      ],
      exec,
      readFile: () => makePdfBytes(),
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      'pnpm --filter @grantpipe/site exec wrangler r2 object put "grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf" --file "/repo/apps/site/.lead-magnet-pdfs/grant-compliance-checklist.pdf" --content-type application/pdf --remote',
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      'pnpm --filter @grantpipe/site exec wrangler r2 object put "grantpipe-documents/lead-magnets/donor-retention-playbook.pdf" --file "/repo/apps/site/.lead-magnet-pdfs/donor-retention-playbook.pdf" --content-type application/pdf --remote',
    );
  });

  it("uses the default Wrangler command runner when no exec override is provided", () => {
    readFileSyncMock.mockReturnValue(makePdfBytes());

    syncLeadMagnetsToR2({
      bucket: "grantpipe-documents",
      entries: [makeEntry()],
    });

    expect(execSyncMock).toHaveBeenCalledWith(
      'pnpm --filter @grantpipe/site exec wrangler r2 object put "grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf" --file "/repo/apps/site/.lead-magnet-pdfs/grant-compliance-checklist.pdf" --content-type application/pdf --remote',
      { stdio: "inherit" },
    );
  });

  it("uploads an xlsx entry with the spreadsheet content type", () => {
    const exec = vi.fn();
    syncLeadMagnetsToR2({
      bucket: "grantpipe-documents",
      entries: [makeSheetEntry()],
      exec,
      readFile: () => makeXlsxBytes(),
    });

    expect(exec).toHaveBeenCalledWith(
      'pnpm --filter @grantpipe/site exec wrangler r2 object put "grantpipe-documents/lead-magnets/grant-tracking-template.xlsx" --file "/repo/apps/site/.lead-magnet-pdfs/grant-tracking-template.xlsx" --content-type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet --remote',
    );
  });

  it("rejects a local xlsx artifact that lacks the ZIP magic bytes", () => {
    const exec = vi.fn();
    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeSheetEntry()],
        exec,
        readFile: () => makePdfBytes(),
      }),
    ).toThrow("Local file is not a xlsx: lead-magnets/grant-tracking-template.xlsx");
    expect(exec).not.toHaveBeenCalled();
  });

  it("retries transient Wrangler upload failures before moving to the next file", () => {
    const exec = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Cloudflare API 520");
      })
      .mockImplementationOnce(() => {
        throw new Error("Cloudflare API 522");
      })
      .mockImplementation(() => undefined);
    const wait = vi.fn();

    syncLeadMagnetsToR2({
      bucket: "grantpipe-documents",
      entries: [makeEntry()],
      exec,
      maxUploadAttempts: 3,
      readFile: () => makePdfBytes(),
      wait,
      waitBetweenAttemptsMs: 25,
    });

    expect(exec).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 25);
    expect(wait).toHaveBeenNthCalledWith(2, 50);
  });

  it("throws the final upload failure after all retry attempts are exhausted", () => {
    const exec = vi.fn(() => {
      throw new Error("Cloudflare API 522");
    });
    const wait = vi.fn();

    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec,
        maxUploadAttempts: 2,
        readFile: () => makePdfBytes(),
        wait,
        waitBetweenAttemptsMs: 10,
      }),
    ).toThrow("Cloudflare API 522");

    expect(exec).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid retry attempt counts", () => {
    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec: vi.fn(),
        maxUploadAttempts: 0,
        readFile: () => makePdfBytes(),
      }),
    ).toThrow("maxAttempts must be at least 1");
  });

  it("uses the default synchronous wait when no wait override is supplied", () => {
    const exec = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Cloudflare API 520");
      })
      .mockImplementation(() => undefined);

    syncLeadMagnetsToR2({
      bucket: "grantpipe-documents",
      entries: [makeEntry()],
      exec,
      maxUploadAttempts: 2,
      readFile: () => makePdfBytes(),
      waitBetweenAttemptsMs: 0,
    });

    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("wraps non-Error upload failures after the final retry", () => {
    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec: () => {
          throw "Cloudflare API 522";
        },
        maxUploadAttempts: 1,
        readFile: () => makePdfBytes(),
      }),
    ).toThrow("Cloudflare API 522");
  });

  it("does not upload when a local PDF artifact is malformed", () => {
    const exec = vi.fn();

    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec,
        readFile: () => Buffer.from("not a pdf"),
      }),
    ).toThrow("Local file is not a pdf: lead-magnets/grant-compliance-checklist.pdf");
    expect(exec).not.toHaveBeenCalled();
  });

  it("does not upload when a local PDF artifact is too small", () => {
    const exec = vi.fn();

    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec,
        readFile: () => Buffer.from("%PDF-1.7\nbody\n%%EOF\n"),
      }),
    ).toThrow("Local file is too small to be a valid resource");
    expect(exec).not.toHaveBeenCalled();
  });

  it("does not upload when a local PDF artifact is missing an EOF marker", () => {
    const exec = vi.fn();

    expect(() =>
      syncLeadMagnetsToR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec,
        readFile: () => {
          const bytes = makePdfBytes();
          bytes.fill(" ", bytes.length - 1024);
          return bytes;
        },
      }),
    ).toThrow("Local file is missing an EOF marker");
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("verifyLeadMagnetsInR2", () => {
  it("builds remote Wrangler get commands for expected R2 objects", () => {
    expect(
      buildVerifyLeadMagnetCommand({
        bucket: "grantpipe-documents",
        r2Key: "lead-magnets/grant-compliance-checklist.pdf",
        outputPath: "/tmp/grantpipe-r2-grant-compliance-checklist.pdf",
      }),
    ).toBe(
      'pnpm --filter @grantpipe/site exec wrangler r2 object get "grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf" --remote --file "/tmp/grantpipe-r2-grant-compliance-checklist.pdf"',
    );
  });

  it("downloads each manifest object remotely and validates PDF structure", () => {
    const exec = vi.fn();
    const readFile = vi.fn(() => makePdfBytes());
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    verifyLeadMagnetsInR2({
      bucket: "grantpipe-documents",
      entries: [makeEntry()],
      exec,
      readFile,
      outputPathForEntry: (entry) => `/tmp/${entry.fileName}`,
    });

    expect(exec).toHaveBeenCalledWith(
      'pnpm --filter @grantpipe/site exec wrangler r2 object get "grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf" --remote --file "/tmp/grant-compliance-checklist.pdf"',
    );
    expect(readFile).toHaveBeenCalledWith("/tmp/grant-compliance-checklist.pdf");
    expect(info).toHaveBeenCalledWith(
      "  Verified lead-magnets/grant-compliance-checklist.pdf (12288 bytes)",
    );
  });

  it("fails clearly when an R2 object is not a PDF", () => {
    expect(() =>
      verifyLeadMagnetsInR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec: vi.fn(),
        readFile: () => Buffer.from("not a pdf"),
        outputPathForEntry: () => "/tmp/not-pdf",
      }),
    ).toThrow("R2 object is not a pdf: lead-magnets/grant-compliance-checklist.pdf");
  });

  it("fails clearly when an R2 PDF is truncated", () => {
    expect(() =>
      verifyLeadMagnetsInR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec: vi.fn(),
        readFile: () => Buffer.from("%PDF-1.7\nbody\n%%EOF\n"),
        outputPathForEntry: () => "/tmp/truncated-pdf",
      }),
    ).toThrow("R2 object is too small to be a valid resource");
  });

  it("fails clearly when an R2 PDF is missing its EOF marker", () => {
    expect(() =>
      verifyLeadMagnetsInR2({
        bucket: "grantpipe-documents",
        entries: [makeEntry()],
        exec: vi.fn(),
        readFile: () => {
          const bytes = makePdfBytes();
          bytes.fill(" ", bytes.length - 1024);
          return bytes;
        },
        outputPathForEntry: () => "/tmp/missing-eof",
      }),
    ).toThrow("R2 object is missing an EOF marker");
  });

  it("validates an R2 xlsx object by its ZIP magic bytes without an EOF check", () => {
    const exec = vi.fn();
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    verifyLeadMagnetsInR2({
      bucket: "grantpipe-documents",
      entries: [makeSheetEntry()],
      exec,
      readFile: () => makeXlsxBytes(),
      outputPathForEntry: (entry) => `/tmp/${entry.fileName}`,
    });

    expect(info).toHaveBeenCalledWith(
      "  Verified lead-magnets/grant-tracking-template.xlsx (12288 bytes)",
    );
    info.mockRestore();
  });

  it("fails clearly when an R2 xlsx object lacks ZIP magic bytes", () => {
    expect(() =>
      verifyLeadMagnetsInR2({
        bucket: "grantpipe-documents",
        entries: [makeSheetEntry()],
        exec: vi.fn(),
        readFile: () => makePdfBytes(),
        outputPathForEntry: () => "/tmp/not-xlsx",
      }),
    ).toThrow("R2 object is not a xlsx: lead-magnets/grant-tracking-template.xlsx");
  });

  it("uses the default Wrangler runner and temporary output path when no overrides are provided", () => {
    readFileSyncMock.mockReturnValue(makePdfBytes());

    verifyLeadMagnetsInR2({
      bucket: "grantpipe-documents",
      entries: [makeEntry()],
    });

    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^pnpm --filter @grantpipe\/site exec wrangler r2 object get "grantpipe-documents\/lead-magnets\/grant-compliance-checklist\.pdf" --remote --file ".*grantpipe-r2-grant-compliance-checklist\.pdf"$/,
      ),
      { stdio: "inherit" },
    );
    expect(readFileSyncMock).toHaveBeenCalledWith(
      expect.stringMatching(/grantpipe-r2-grant-compliance-checklist\.pdf$/),
    );
  });
});

describe("runWranglerCommand", () => {
  it("executes the command with inherited stdio", () => {
    runWranglerCommand("pnpm wrangler --version");

    expect(execSyncMock).toHaveBeenCalledWith("pnpm wrangler --version", {
      stdio: "inherit",
    });
  });
});

describe("run", () => {
  it("rejects invalid bucket names", () => {
    expect(() => run({ bucketName: "GrantPipe_Documents" })).toThrow("Invalid bucket name");
  });

  it("reads, validates, and uploads manifest entries with injected IO", () => {
    const exec = vi.fn();
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    run({
      bucketName: "grantpipe-documents",
      readFile: () => JSON.stringify([makeEntry()]),
      fileExists: () => true,
      promotedSlugs: ["grant-compliance-checklist"],
      requiredSlugs: ["grant-compliance-checklist"],
      exec,
      readBinaryFile: () => makePdfBytes(),
    });

    expect(exec).toHaveBeenCalledWith(
      'pnpm --filter @grantpipe/site exec wrangler r2 object put "grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf" --file "/repo/apps/site/.lead-magnet-pdfs/grant-compliance-checklist.pdf" --content-type application/pdf --remote',
    );
    expect(info).toHaveBeenCalledWith(
      'Found 1 PDF file(s) to sync to R2 bucket "grantpipe-documents"',
    );
    expect(info).toHaveBeenCalledWith("\nSync complete. 1 file(s) uploaded to R2.");
    info.mockRestore();
  });

  it("uses the default bucket name when no override or environment variable is set", () => {
    const previousBucket = process.env.CLOUDFLARE_R2_BUCKET;
    delete process.env.CLOUDFLARE_R2_BUCKET;
    const exec = vi.fn();
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      run({
        readFile: () => JSON.stringify([makeEntry()]),
        fileExists: () => true,
        promotedSlugs: ["grant-compliance-checklist"],
        requiredSlugs: ["grant-compliance-checklist"],
        exec,
        readBinaryFile: () => makePdfBytes(),
      });
    } finally {
      if (previousBucket === undefined) {
        delete process.env.CLOUDFLARE_R2_BUCKET;
      } else {
        process.env.CLOUDFLARE_R2_BUCKET = previousBucket;
      }
      info.mockRestore();
    }

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('"grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf"'),
    );
  });

  it("uses the bucket from the environment when no override is provided", () => {
    const previousBucket = process.env.CLOUDFLARE_R2_BUCKET;
    process.env.CLOUDFLARE_R2_BUCKET = "env-bucket";
    const exec = vi.fn();
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      run({
        readFile: () => JSON.stringify([makeEntry()]),
        fileExists: () => true,
        promotedSlugs: ["grant-compliance-checklist"],
        requiredSlugs: ["grant-compliance-checklist"],
        exec,
        readBinaryFile: () => makePdfBytes(),
      });
    } finally {
      if (previousBucket === undefined) {
        delete process.env.CLOUDFLARE_R2_BUCKET;
      } else {
        process.env.CLOUDFLARE_R2_BUCKET = previousBucket;
      }
      info.mockRestore();
    }

    expect(exec).toHaveBeenCalledWith(
      expect.stringContaining('"env-bucket/lead-magnets/grant-compliance-checklist.pdf"'),
    );
  });

  it("verifies R2 objects instead of uploading when verifyOnly is true", () => {
    const exec = vi.fn();
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    run({
      bucketName: "grantpipe-documents",
      readFile: () => JSON.stringify([makeEntry()]),
      fileExists: () => true,
      promotedSlugs: ["grant-compliance-checklist"],
      requiredSlugs: ["grant-compliance-checklist"],
      verifyOnly: true,
      exec,
      readBinaryFile: () => makePdfBytes(),
      outputPathForEntry: (entry) => `/tmp/${entry.fileName}`,
    });

    expect(exec).toHaveBeenCalledWith(
      'pnpm --filter @grantpipe/site exec wrangler r2 object get "grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf" --remote --file "/tmp/grant-compliance-checklist.pdf"',
    );
    expect(info).toHaveBeenCalledWith('Verifying 1 PDF file(s) in R2 bucket "grantpipe-documents"');
    expect(info).toHaveBeenCalledWith("\nVerification complete. 1 R2 PDF file(s) available.");
    info.mockRestore();
  });
});

describe("runCli", () => {
  it("does nothing when invoked from an import", () => {
    const execute = vi.fn();

    runCli({ argv: ["node"], execute });
    runCli({ argv: ["node", "/tmp/other-script.ts"], execute });

    expect(execute).not.toHaveBeenCalled();
  });

  it("runs the sync when invoked as the script entrypoint", () => {
    const execute = vi.fn();

    runCli({ argv: ["node", SCRIPT_PATH], execute });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("uses the default CLI executor when no execute override is provided", () => {
    const entries = LEAD_MAGNET_SLUGS.map(makeSlugEntry);
    const bytesByPath = new Map(
      entries.map((entry) => [entry.outputPath, makeAssetBytes(entry.slug)] as const),
    );
    readFileSyncMock.mockImplementation((path: string) => {
      const bytes = bytesByPath.get(path);
      return bytes ?? JSON.stringify(entries);
    });
    existsSyncMock.mockReturnValue(true);
    const info = vi.spyOn(console, "log").mockImplementation(() => undefined);

    runCli({ argv: ["node", SCRIPT_PATH] });

    expect(execSyncMock).toHaveBeenCalledTimes(LEAD_MAGNET_SLUGS.length);
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('"grantpipe-documents/lead-magnets/grant-compliance-checklist.pdf"'),
      { stdio: "inherit" },
    );
    info.mockRestore();
  });

  it("logs Error messages and exits non-zero when the script fails", () => {
    const logError = vi.fn();
    const exit = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH],
      execute: () => {
        throw new Error("sync failed");
      },
      exit,
      logError,
    });

    expect(logError).toHaveBeenCalledWith("sync failed");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("logs non-Error failures and exits non-zero when the script fails", () => {
    const logError = vi.fn();
    const exit = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH],
      execute: () => {
        throw "string failure";
      },
      exit,
      logError,
    });

    expect(logError).toHaveBeenCalledWith("string failure");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
