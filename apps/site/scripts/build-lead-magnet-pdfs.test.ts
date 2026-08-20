import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import {
  stripFrontmatter,
  parseFrontmatterField,
  getBrowserExecutablePath,
  buildBrowserLaunchOptions,
  buildManifestEntries,
  computeContentHash,
  MANIFEST_FILENAME,
} from "./build-lead-magnet-pdfs.js";
import {
  renderPdfHtml,
  PDF_FOOTER_TEMPLATE,
  PDF_HEADER_TEMPLATE,
} from "./lead-magnet-pdf-template.js";
import { LEAD_MAGNET_SLUGS } from "../../../packages/shared/src/constants/lead-magnets";
const originalPuppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available in vi.mock factories,
// which are hoisted to the top of the file by Vitest's transformer.
// ---------------------------------------------------------------------------

const {
  mockPdf,
  mockSetContent,
  mockEvaluate,
  mockPageClose,
  mockNewPage,
  mockBrowserClose,
  mockLaunch,
} = vi.hoisted(() => {
  const mockPdf = vi.fn().mockResolvedValue(new Uint8Array(4));
  const mockSetContent = vi.fn().mockResolvedValue(undefined);
  const mockEvaluate = vi.fn().mockResolvedValue(undefined);
  const mockPageClose = vi.fn().mockResolvedValue(undefined);
  const mockNewPage = vi.fn().mockResolvedValue({
    setContent: mockSetContent,
    evaluate: mockEvaluate,
    pdf: mockPdf,
    close: mockPageClose,
  });
  const mockBrowserClose = vi.fn().mockResolvedValue(undefined);
  const mockLaunch = vi.fn().mockResolvedValue({
    newPage: mockNewPage,
    close: mockBrowserClose,
  });
  return {
    mockPdf,
    mockSetContent,
    mockEvaluate,
    mockPageClose,
    mockNewPage,
    mockBrowserClose,
    mockLaunch,
  };
});

vi.mock("puppeteer", () => ({
  default: { launch: mockLaunch },
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue("---\ntitle: test\nbluf: Test bluf\n---\n\nContent"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue("---\ntitle: test\nbluf: Test bluf\n---\n\nContent"),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// stripFrontmatter
// ---------------------------------------------------------------------------

describe("stripFrontmatter", () => {
  it("strips YAML frontmatter from markdown content", () => {
    const input = `---
title: "Test Title"
description: "A description"
publishedAt: "2026-01-01"
---

## My Content

Some text here.`;

    const result = stripFrontmatter(input);
    expect(result).not.toContain("---");
    expect(result).not.toContain("title:");
    expect(result).not.toContain("description:");
    expect(result.trim()).toBe("## My Content\n\nSome text here.");
  });

  it("returns content unchanged when no frontmatter is present", () => {
    const input = "## Just a heading\n\nSome content.";
    const result = stripFrontmatter(input);
    expect(result).toBe(input);
  });

  it("handles empty frontmatter block", () => {
    const input = "---\n---\n\nContent here.";
    const result = stripFrontmatter(input);
    expect(result.trim()).toBe("Content here.");
  });

  it("handles frontmatter with multiline values", () => {
    const input = `---
title: "My Title"
relatedPages:
  - "/page/one"
  - "/page/two"
---

Body content.`;
    const result = stripFrontmatter(input);
    expect(result.trim()).toBe("Body content.");
  });

  it("does not strip --- that appears mid-document (not frontmatter)", () => {
    const input = "## Section\n\n---\n\nMore content.";
    const result = stripFrontmatter(input);
    expect(result).toBe(input);
  });

  it("returns content unchanged when opening --- has no closing ---", () => {
    const input = "---\ntitle: orphaned\n";
    const result = stripFrontmatter(input);
    expect(result).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// parseFrontmatterField
// ---------------------------------------------------------------------------

describe("parseFrontmatterField", () => {
  it("extracts a quoted string value", () => {
    const content = `---
title: "My Title"
deliverableType: pdf
---
Body`;
    expect(parseFrontmatterField(content, "title")).toBe("My Title");
  });

  it("extracts an unquoted string value", () => {
    const content = `---
deliverableType: pdf
title: Unquoted Title
---
Body`;
    expect(parseFrontmatterField(content, "deliverableType")).toBe("pdf");
  });

  it("returns undefined when the field is not present", () => {
    const content = `---
title: "A Title"
---
Body`;
    expect(parseFrontmatterField(content, "missing")).toBeUndefined();
  });

  it("returns undefined when there is no frontmatter", () => {
    const content = "## Just content\nNo frontmatter.";
    expect(parseFrontmatterField(content, "title")).toBeUndefined();
  });

  it("handles single-quoted strings", () => {
    const content = `---
title: 'Single Quoted'
---
Body`;
    expect(parseFrontmatterField(content, "title")).toBe("Single Quoted");
  });

  it("returns undefined when frontmatter has no closing ---", () => {
    const content = "---\ntitle: orphaned frontmatter\n";
    expect(parseFrontmatterField(content, "title")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// browser executable resolution
// ---------------------------------------------------------------------------

describe("getBrowserExecutablePath", () => {
  it("prefers PUPPETEER_EXECUTABLE_PATH when provided", () => {
    expect(
      getBrowserExecutablePath({
        env: { PUPPETEER_EXECUTABLE_PATH: "C:/Browsers/Chrome/chrome.exe" },
        platform: "win32",
        pathExists: () => false,
      }),
    ).toBe("C:/Browsers/Chrome/chrome.exe");
  });

  it("falls back to a common Windows Edge path when no env override exists", () => {
    expect(
      getBrowserExecutablePath({
        env: {},
        platform: "win32",
        pathExists: (path) =>
          path === "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      }),
    ).toBe("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
  });

  it("returns undefined when no known browser path exists", () => {
    expect(
      getBrowserExecutablePath({
        env: {},
        platform: "win32",
        pathExists: () => false,
      }),
    ).toBeUndefined();
  });
});

describe("buildBrowserLaunchOptions", () => {
  it("uses stable headless launch defaults for PDF builds", () => {
    expect(buildBrowserLaunchOptions({})).toEqual({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      headless: true,
      pipe: true,
      timeout: 120_000,
    });
  });

  it("keeps an env-provided browser executable path", () => {
    expect(
      buildBrowserLaunchOptions({
        PUPPETEER_EXECUTABLE_PATH: "/custom/chrome",
      }),
    ).toEqual({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      executablePath: "/custom/chrome",
      headless: true,
      pipe: true,
      timeout: 120_000,
    });
  });
});

// ---------------------------------------------------------------------------
// renderPdfHtml
// ---------------------------------------------------------------------------

describe("renderPdfHtml", () => {
  const sampleBodyHtml = `
    <h2>Grant Compliance Basics</h2>
    <p>Some content here.</p>
    <h2>Reporting Requirements</h2>
    <p>More content.</p>
    <h2>Audit Preparation</h2>
    <p>Final section.</p>
  `;

  const baseParams = {
    title: "Grant Compliance Checklist",
    bluf: "Everything your team needs to pass a grant audit.",
    slug: "grant-compliance-checklist",
    bodyHtml: sampleBodyHtml,
    publishedAt: "April 2026",
  };

  it("contains the document title in the cover section", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("Grant Compliance Checklist");
  });

  it("contains the bluf text in the cover section", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("Everything your team needs to pass a grant audit.");
  });

  it("contains a cover section marker", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toMatch(/id="cover"|class="cover"|id='cover'|class='cover'/);
  });

  it("contains each h2 heading in the TOC section", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("Grant Compliance Basics");
    expect(html).toContain("Reporting Requirements");
    expect(html).toContain("Audit Preparation");
  });

  it("contains the CTA page with trial link text", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain(marketingKnowledge.ctas.trial.label);
  });

  it("contains the CTA signup URL", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("https://app.grantpipe.com/app/signup");
  });

  it("PDF_FOOTER_TEMPLATE contains grantpipe.com", () => {
    expect(PDF_FOOTER_TEMPLATE).toContain("grantpipe.com");
  });

  it("renders without publishedAt when not provided", () => {
    const html = renderPdfHtml({ ...baseParams, publishedAt: undefined });
    expect(html).toContain("Grant Compliance Checklist");
    expect(html).not.toContain("undefined");
  });

  it("contains the Table of Contents heading", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("Table of Contents");
  });

  it("renders the inline GrantPipe logo on the cover band", () => {
    const html = renderPdfHtml(baseParams);
    const coverBandMatch = html.match(
      /<div class="cover-band">[\s\S]*?<\/div>\s*<div class="cover-body">/,
    );

    expect(coverBandMatch).not.toBeNull();
    const coverBand = coverBandMatch![0]!;
    expect(coverBand).toContain('class="cover-logo-panel"');
    expect(coverBand).toContain('data-logo-mark="grantpipe-mark"');
    expect(coverBand).toContain("#047857");
    expect(coverBand).toContain("#d99a18");
    expect(coverBand).toContain('fill="#ffffff"');
    expect(coverBand).not.toContain("cover-wordmark");
    expect(coverBand).not.toContain(">GrantPipe</span>");
  });

  it("contains the publication date when provided", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("April 2026");
  });

  it("contains grantpipe.com domain reference", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("grantpipe.com");
  });

  it("exports PDF_HEADER_TEMPLATE as empty string", () => {
    expect(PDF_HEADER_TEMPLATE).toBe("");
  });

  it("exports PDF_FOOTER_TEMPLATE as non-empty string", () => {
    expect(PDF_FOOTER_TEMPLATE.length).toBeGreaterThan(0);
  });

  it("contains the body HTML in the output", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("Some content here.");
  });

  it("contains the slug in the rendered HTML", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toContain("grant-compliance-checklist");
  });

  it("handles bodyHtml with no h2 tags gracefully", () => {
    const html = renderPdfHtml({ ...baseParams, bodyHtml: "<p>Only a paragraph.</p>" });
    expect(html).toContain("Table of Contents");
    expect(html).toContain("Only a paragraph.");
  });

  it("strips inner HTML tags from h2 when building TOC", () => {
    const html = renderPdfHtml({
      ...baseParams,
      bodyHtml: "<h2><strong>Bold Heading</strong></h2><p>Content</p>",
    });
    expect(html).toContain("Bold Heading");
  });

  it("escapes special HTML characters in title and bluf in the cover section", () => {
    const html = renderPdfHtml({
      ...baseParams,
      title: "Grants & <Donors>",
      bluf: "Plain bluf",
    });
    expect(html).toContain("Grants &amp; &lt;Donors&gt;");
    expect(html).not.toContain("Grants & <Donors>");
  });

  it("does not render a 'See p. —' placeholder in the TOC", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).not.toContain("See p.");
    expect(html).not.toContain("See p");
  });

  it("numbers TOC entries in reading order", () => {
    const html = renderPdfHtml(baseParams);
    expect(html).toMatch(/01.*Grant Compliance Basics/s);
    expect(html).toMatch(/02.*Reporting Requirements/s);
    expect(html).toMatch(/03.*Audit Preparation/s);
  });

  it("escapes special characters in TOC entries", () => {
    const html = renderPdfHtml({
      ...baseParams,
      bodyHtml: "<h2>Grants & Donors</h2><p>Content</p>",
    });
    expect(html).toContain("Grants &amp; Donors");
  });

  it("decodes HTML entities from Astro-rendered h2 text in TOC", () => {
    const html = renderPdfHtml({
      ...baseParams,
      bodyHtml: "<h2>What&#39;s Changed in 2026</h2><p>Content</p>",
    });
    // Isolate the TOC block and assert the decoded apostrophe appears there.
    // The raw bodyHtml is also inserted verbatim, so entity strings may
    // appear elsewhere — only the TOC slice is under test.
    const tocMatch = html.match(/id="toc"[\s\S]*?<!-- Body pages -->/);
    expect(tocMatch).not.toBeNull();
    const tocSlice = tocMatch![0]!;
    expect(tocSlice).not.toContain("&amp;#39;");
    expect(tocSlice).not.toContain("&#39;");
    expect(tocSlice).toContain("What's Changed");
  });
});

// ---------------------------------------------------------------------------
// computeContentHash
// ---------------------------------------------------------------------------

describe("computeContentHash", () => {
  it("returns a deterministic 64-char hex string for a given input", () => {
    const hash = computeContentHash("hello world");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    // Calling again with same input yields same hash
    expect(computeContentHash("hello world")).toBe(hash);
  });

  it("produces different hashes for different inputs", () => {
    expect(computeContentHash("content A")).not.toBe(computeContentHash("content B"));
  });
});

// ---------------------------------------------------------------------------
// buildManifestEntries contentHash field
// ---------------------------------------------------------------------------

describe("buildManifestEntries — contentHash", () => {
  it("populates contentHash deterministically for each entry", () => {
    const files = LEAD_MAGNET_SLUGS.map((slug) => `${slug}.md`);
    const readFile = (path: string): string => {
      const slug = String(path).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return `---\ntitle: "${slug}"\nbluf: "b"\ndeliverableType: pdf\n---\n\nContent for ${slug}`;
    };

    const entries = buildManifestEntries(files, "/content", "/out", readFile);

    for (const entry of entries) {
      expect(entry.contentHash).toBeDefined();
      expect(entry.contentHash).toHaveLength(64);
    }

    // Calling again yields identical hashes
    const entries2 = buildManifestEntries(files, "/content", "/out", readFile);
    for (let i = 0; i < entries.length; i++) {
      expect(entries[i]!.contentHash).toBe(entries2[i]!.contentHash);
    }
  });

  it("produces a different contentHash when source content changes", () => {
    const slug = LEAD_MAGNET_SLUGS[0]!;
    const file = `${slug}.md`;
    const files = LEAD_MAGNET_SLUGS.map((s) => `${s}.md`);

    const readFileV1 = (path: string): string => {
      const s = String(path).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      const body = s === slug ? "Version 1 content" : `Content for ${s}`;
      return `---\ntitle: "${s}"\nbluf: "b"\ndeliverableType: pdf\n---\n\n${body}`;
    };

    const readFileV2 = (path: string): string => {
      const s = String(path).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      const body = s === slug ? "Version 2 content (changed)" : `Content for ${s}`;
      return `---\ntitle: "${s}"\nbluf: "b"\ndeliverableType: pdf\n---\n\n${body}`;
    };

    const [entries1] = [buildManifestEntries(files, "/content", "/out", readFileV1)];
    const [entries2] = [buildManifestEntries(files, "/content", "/out", readFileV2)];

    const e1 = entries1.find((e) => e.slug === slug)!;
    const e2 = entries2.find((e) => e.slug === slug)!;
    expect(e1.contentHash).not.toBe(e2.contentHash);

    // Unchanged entries keep the same hash
    const other = LEAD_MAGNET_SLUGS[1]!;
    const o1 = entries1.find((e) => e.slug === other)!;
    const o2 = entries2.find((e) => e.slug === other)!;
    expect(o1.contentHash).toBe(o2.contentHash);

    // Ensure the variable `file` is used (linting)
    void file;
  });
});

// ---------------------------------------------------------------------------
// buildPdf
// ---------------------------------------------------------------------------

describe("buildPdf", () => {
  beforeEach(() => {
    mockPdf.mockReset();
    mockSetContent.mockReset();
    mockEvaluate.mockReset();
    mockPageClose.mockReset();
    mockBrowserClose.mockReset();
    mockNewPage.mockReset();
    mockLaunch.mockReset();
    // Re-establish resolved values after reset
    mockPdf.mockResolvedValue(new Uint8Array(4));
    mockSetContent.mockResolvedValue(undefined);
    mockEvaluate.mockResolvedValue(undefined);
    mockPageClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
    mockNewPage.mockResolvedValue({
      setContent: mockSetContent,
      evaluate: mockEvaluate,
      pdf: mockPdf,
      close: mockPageClose,
    });
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPuppeteerExecutablePath === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      process.env.PUPPETEER_EXECUTABLE_PATH = originalPuppeteerExecutablePath;
    }
  });

  it("launches puppeteer and generates a PDF", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: My Title\nbluf: My bluf\n---\n\n## Section\n\nContent." as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "My Title", "My bluf");

    expect(mockLaunch).toHaveBeenCalledWith({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      headless: true,
      pipe: true,
      timeout: 120_000,
    });
  });

  it("passes an env-provided browser executable path to puppeteer.launch", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    process.env.PUPPETEER_EXECUTABLE_PATH = "C:/Browsers/Chrome/chrome.exe";

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf");

    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        executablePath: "C:/Browsers/Chrome/chrome.exe",
        headless: true,
        pipe: true,
        timeout: 120_000,
      }),
    );
  });

  it("calls page.pdf with A4 format and printBackground", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf");

    expect(mockPdf).toHaveBeenCalledWith(
      expect.objectContaining({ format: "A4", printBackground: true }),
    );
  });

  it("calls browser.close() after generating PDF", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf");

    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("logs the KB size after generating", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("KB"));
    consoleSpy.mockRestore();
  });

  it("passes publishedAt to renderPdfHtml when provided", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf", "April 2026");

    expect(mockSetContent).toHaveBeenCalledWith(
      expect.stringContaining("April 2026"),
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    expect(mockEvaluate).toHaveBeenCalledWith(expect.any(Function), 15000);
  });

  it("closes browser even when page.pdf() rejects", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    mockPdf.mockRejectedValueOnce(new Error("render failed"));
    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await expect(buildPdf("/src.md", "/out/my-slug.pdf", "Title", "bluf text")).rejects.toThrow(
      "render failed",
    );
    expect(mockBrowserClose).toHaveBeenCalled();
  });

  it("retries on ENOENT and succeeds on the second attempt", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    const enoentError = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
    });
    mockPdf.mockRejectedValueOnce(enoentError).mockResolvedValueOnce(new Uint8Array(8));

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf");

    // Two pages were opened: one failed, one succeeded
    expect(mockNewPage).toHaveBeenCalledTimes(2);
    // The failed page was closed before the retry
    expect(mockPageClose).toHaveBeenCalledTimes(1);
    // Final PDF call succeeded
    expect(mockPdf).toHaveBeenCalledTimes(2);
  });

  it("retries on ENOENT in message and succeeds on the third attempt", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    const enoentError = new Error("getReadableAsTypedArray ENOENT open failed");
    mockPdf
      .mockRejectedValueOnce(enoentError)
      .mockRejectedValueOnce(enoentError)
      .mockResolvedValueOnce(new Uint8Array(12));

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf");

    expect(mockNewPage).toHaveBeenCalledTimes(3);
    expect(mockPageClose).toHaveBeenCalledTimes(2);
    expect(mockPdf).toHaveBeenCalledTimes(3);
  });

  it("throws after 3 ENOENT failures without further retries", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    const enoentError = Object.assign(new Error("ENOENT: no such file or directory"), {
      code: "ENOENT",
    });
    mockPdf.mockRejectedValue(enoentError);

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await expect(buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf")).rejects.toThrow(
      "ENOENT",
    );

    // Exactly 3 attempts were made
    expect(mockPdf).toHaveBeenCalledTimes(3);
    expect(mockPageClose).toHaveBeenCalledTimes(3);
  });

  it("rethrows non-ENOENT errors immediately without retrying", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockReturnValue(
      "---\ntitle: t\nbluf: b\n---\n\nContent" as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );
    mockPdf.mockRejectedValueOnce(new Error("render failed"));

    const { buildPdf } = await import("./build-lead-magnet-pdfs.js");
    await expect(buildPdf("/src.md", "/out/my-slug.pdf", "Title", "Bluf")).rejects.toThrow(
      "render failed",
    );

    // Only one attempt — no retry for non-ENOENT
    expect(mockPdf).toHaveBeenCalledTimes(1);
    expect(mockPageClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const ALL_EXPECTED_SLUGS = [...LEAD_MAGNET_SLUGS];

function makeMagnetContent(slug: string, title: string): string {
  return `---\ntitle: "${title}"\nbluf: "Bluf for ${slug}"\ndeliverableType: pdf\n---\n\n## Content for ${slug}`;
}

function makeSheetContent(slug: string): string {
  return `---\ntitle: "Title for ${slug}"\nbluf: "Bluf for ${slug}"\ndeliverableType: sheet\n---\n\n## Content for ${slug}`;
}

function contentForSlug(slug: string): string {
  return slug === "grant-tracking-template" || slug === "grant-budget-template"
    ? makeSheetContent(slug)
    : makeMagnetContent(slug, `Title for ${slug}`);
}

const MOCK_MD_FILES = ALL_EXPECTED_SLUGS.map((slug) => `${slug}.md`);

describe("run", () => {
  beforeEach(() => {
    mockPdf.mockReset();
    mockSetContent.mockReset();
    mockEvaluate.mockReset();
    mockPageClose.mockReset();
    mockBrowserClose.mockReset();
    mockNewPage.mockReset();
    mockLaunch.mockReset();
    mockPdf.mockResolvedValue(new Uint8Array(4));
    mockSetContent.mockResolvedValue(undefined);
    mockEvaluate.mockResolvedValue(undefined);
    mockPageClose.mockResolvedValue(undefined);
    mockBrowserClose.mockResolvedValue(undefined);
    mockNewPage.mockResolvedValue({
      setContent: mockSetContent,
      evaluate: mockEvaluate,
      pdf: mockPdf,
      close: mockPageClose,
    });
    mockLaunch.mockResolvedValue({ newPage: mockNewPage, close: mockBrowserClose });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPuppeteerExecutablePath === undefined) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      process.env.PUPPETEER_EXECUTABLE_PATH = originalPuppeteerExecutablePath;
    }
  });

  it("creates output directory when it does not exist", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
      expect.stringContaining(".lead-magnet-pdfs"),
      { recursive: true },
    );
  });

  it("skips mkdir when output directory already exists", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(vi.mocked(fs.mkdirSync)).not.toHaveBeenCalled();
  });

  it("builds a PDF for every magnet with deliverableType: pdf", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(mockLaunch).toHaveBeenCalledTimes(1);
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        headless: true,
        pipe: true,
        timeout: 120_000,
      }),
    );
  });

  it("writes a manifest containing every built PDF artifact", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining(MANIFEST_FILENAME),
      expect.stringContaining('"r2Key": "lead-magnets/grant-compliance-checklist.pdf"'),
    );
  });

  it("skips magnets whose deliverableType is not pdf", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      ...LEAD_MAGNET_SLUGS.map((slug) => `${slug}.md`),
      "some-article.md",
    ] as unknown as ReturnType<typeof fs.readdirSync>);

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const filename = String(p).replace(/\\/g, "/").split("/").pop()!;
      const slug = filename.replace(".md", "");
      if ((LEAD_MAGNET_SLUGS as readonly string[]).includes(slug)) {
        return makeMagnetContent(slug, `Title for ${slug}`);
      }
      return '---\ntitle: "Article"\nbluf: "A bluf"\ndeliverableType: article\n---\n\nContent';
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it("uses bluf field falling back to description when bluf missing", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      LEAD_MAGNET_SLUGS.map((slug) => `${slug}.md`) as unknown as ReturnType<typeof fs.readdirSync>,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      '---\ntitle: "Checklist"\ndescription: "Fallback description"\ndeliverableType: pdf\n---\n\nContent' as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(consoleSpy).toHaveBeenCalled();
    expect(mockSetContent).toHaveBeenCalledWith(
      expect.stringContaining("Fallback description"),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it("falls back to empty string when both bluf and description are missing", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      LEAD_MAGNET_SLUGS.map((slug) => `${slug}.md`) as unknown as ReturnType<typeof fs.readdirSync>,
    );
    vi.mocked(fs.readFileSync).mockReturnValue(
      '---\ntitle: "Checklist"\ndeliverableType: pdf\n---\n\nContent' as unknown as ReturnType<
        typeof import("fs").readFileSync
      >,
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    expect(mockSetContent).toHaveBeenCalledWith(
      expect.not.stringContaining("undefined"),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it("fails fast when a promoted magnet does not have a PDF artifact", () => {
    expect(() =>
      buildManifestEntries(
        ["grant-reporting-calendar-template.md"],
        "/content",
        "/out",
        () =>
          '---\ntitle: "Calendar"\ndeliverableType: pdf\npublishedAt: "2026-01-01"\n---\n\nContent',
      ),
    ).toThrow("Missing PDF lead magnets for promoted slugs");
  });

  it("skips entries whose previous manifest hash matches and output PDF exists", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockImplementation(() => {
      // output dir exists; ALL pdf files exist
      return true;
    });
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    const fileContent = (p: unknown): string => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    };
    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      return fileContent(p);
    }) as typeof fs.readFileSync);

    // Build entries to compute hashes (mirrors what run() will compute)
    const files = MOCK_MD_FILES;
    const entries = buildManifestEntries(files, "/content", "/out", (p: string) => fileContent(p));
    const previousManifest = entries.map((e) => ({ ...e }));

    // Make readFileSync for the manifest path return the previous manifest JSON
    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const path = String(p);
      if (path.includes("manifest.json")) {
        return JSON.stringify(previousManifest);
      }
      return fileContent(p);
    }) as typeof fs.readFileSync);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    // No PDF generation was triggered — browser may have been launched but no pages created
    expect(mockPdf).not.toHaveBeenCalled();
    // Skip log should have appeared for each entry
    const skipCalls = consoleSpy.mock.calls.filter((args) =>
      String(args[0]).includes("PDF unchanged:"),
    );
    expect(skipCalls.length).toBeGreaterThan(0);
    consoleSpy.mockRestore();
  });

  it("regenerates when content hash mismatches even if PDF file exists", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    const fileContent = (p: unknown): string => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    };

    // Previous manifest has stale hashes (all "deadbeef")
    const stalePreviousManifest = MOCK_MD_FILES.map((f) => ({
      slug: f.replace(".md", ""),
      contentHash: "deadbeef",
      title: "old",
      sourcePath: `/content/${f}`,
      outputPath: `/out/${f.replace(".md", ".pdf")}`,
      fileName: f.replace(".md", ".pdf"),
      r2Key: `lead-magnets/${f.replace(".md", ".pdf")}`,
      promoted: false,
    }));

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const path = String(p);
      if (path.includes("manifest.json")) {
        return JSON.stringify(stalePreviousManifest);
      }
      return fileContent(p);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    // All PDFs should have been regenerated due to hash mismatch
    expect(mockPdf).toHaveBeenCalled();
  });

  it("regenerates when output PDF does not exist even if hash matches", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    const fileContent = (p: unknown): string => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    };

    const files = MOCK_MD_FILES;
    const entries = buildManifestEntries(files, "/content", "/out", (p: string) => fileContent(p));
    const previousManifest = entries.map((e) => ({ ...e }));

    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const path = String(p);
      // output dir exists, manifest exists, but PDF files do NOT exist
      if (path.endsWith(".pdf")) return false;
      return true;
    });

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const path = String(p);
      if (path.includes("manifest.json")) {
        return JSON.stringify(previousManifest);
      }
      return fileContent(p);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    // PDFs were regenerated because output files were missing
    expect(mockPdf).toHaveBeenCalled();
  });

  it("FORCE_PDF_REBUILD=1 bypasses the incremental skip even when hash matches and file exists", async () => {
    const fs = await import("fs");
    vi.stubEnv("FORCE_PDF_REBUILD", "1");

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );

    const fileContent = (p: unknown): string => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    };

    const files = MOCK_MD_FILES;
    const entries = buildManifestEntries(files, "/content", "/out", (p: string) => fileContent(p));
    const previousManifest = entries.map((e) => ({ ...e }));

    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const path = String(p);
      if (path.includes("manifest.json")) {
        return JSON.stringify(previousManifest);
      }
      return fileContent(p);
    }) as typeof fs.readFileSync);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    // All PDFs regenerated despite matching hashes
    expect(mockPdf).toHaveBeenCalled();
  });

  it("relaunches browser and retries once when puppeteer disconnects mid-loop", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(false); // force fresh run, no skip
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );
    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    }) as typeof fs.readFileSync);

    // First PDF call throws a "Target closed" disconnect error
    const disconnectError = new Error("Target closed");
    mockPdf.mockRejectedValueOnce(disconnectError).mockResolvedValue(new Uint8Array(4));

    // First browser instance is "disconnected" after the error
    const deadBrowserClose = vi.fn().mockResolvedValue(undefined);
    const freshBrowserClose = vi.fn().mockResolvedValue(undefined);

    const deadBrowser = {
      newPage: mockNewPage,
      close: deadBrowserClose,
      connected: false,
    };
    const freshBrowser = {
      newPage: mockNewPage,
      close: freshBrowserClose,
      connected: true,
    };

    mockLaunch.mockResolvedValueOnce(deadBrowser).mockResolvedValueOnce(freshBrowser);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await run();

    // Browser was relaunched once for the disconnect
    expect(mockLaunch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Relaunching"));
    warnSpy.mockRestore();
  });

  it("throws when browser reconnect retry also fails", async () => {
    const fs = await import("fs");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readdirSync).mockReturnValue(
      MOCK_MD_FILES as unknown as ReturnType<typeof fs.readdirSync>,
    );
    vi.mocked(fs.readFileSync).mockImplementation(((p: unknown) => {
      const slug = String(p).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      return contentForSlug(slug);
    }) as typeof fs.readFileSync);

    const disconnectError = new Error("Protocol error: Connection closed");
    // Both first attempt and retry fail with disconnect error
    mockPdf.mockRejectedValueOnce(disconnectError).mockRejectedValueOnce(disconnectError);

    const deadBrowser = {
      newPage: mockNewPage,
      close: vi.fn().mockResolvedValue(undefined),
      connected: false,
    };
    const freshBrowser = {
      newPage: mockNewPage,
      close: vi.fn().mockResolvedValue(undefined),
      connected: false,
    };

    mockLaunch.mockResolvedValueOnce(deadBrowser).mockResolvedValueOnce(freshBrowser);

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { run } = await import("./build-lead-magnet-pdfs.js");
    await expect(run()).rejects.toThrow("Protocol error: Connection closed");
  });

  it("fails fast when any canonical lead magnet slug lacks a PDF artifact", () => {
    const filenames = LEAD_MAGNET_SLUGS.filter(
      (slug) => slug !== "grant-compliance-cost-audit",
    ).map((slug) => `${slug}.md`);

    expect(() =>
      buildManifestEntries(filenames, "/content", "/out", (path) => {
        const slug = String(path).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
        if (slug === "grant-tracking-template" || slug === "grant-budget-template") {
          return makeSheetContent(slug);
        }
        return makeMagnetContent(slug, `Title for ${slug}`);
      }),
    ).toThrow("Missing PDF lead magnets for promoted slugs: grant-compliance-cost-audit");
  });

  it("builds an xlsx manifest entry for a sheet deliverable instead of a PDF", () => {
    const filenames = LEAD_MAGNET_SLUGS.map((slug) => `${slug}.md`);
    const entries = buildManifestEntries(filenames, "/content", "/out", (path) => {
      const slug = String(path).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
      if (slug === "grant-tracking-template" || slug === "grant-budget-template") {
        return makeSheetContent(slug);
      }
      return makeMagnetContent(slug, `Title for ${slug}`);
    });

    const sheet = entries.find((entry) => entry.slug === "grant-tracking-template");
    expect(sheet).toBeDefined();
    expect(sheet?.assetType).toBe("xlsx");
    expect(sheet?.fileName).toBe("grant-tracking-template.xlsx");
    expect(sheet?.r2Key).toBe("lead-magnets/grant-tracking-template.xlsx");
    expect(sheet?.outputPath.endsWith("grant-tracking-template.xlsx")).toBe(true);
    expect(sheet?.sourcePath.endsWith("grant-tracking-template.xlsx")).toBe(true);
    expect(sheet?.promoted).toBe(false);

    // PDF entries keep their assetType
    const pdf = entries.find((entry) => entry.slug === "grant-compliance-checklist");
    expect(pdf?.assetType).toBe("pdf");
    expect(pdf?.r2Key).toBe("lead-magnets/grant-compliance-checklist.pdf");
  });

  it("does not flag the xlsx slug as a missing supported PDF", () => {
    const filenames = LEAD_MAGNET_SLUGS.map((slug) => `${slug}.md`);
    expect(() =>
      buildManifestEntries(filenames, "/content", "/out", (path) => {
        const slug = String(path).replace(/\\/g, "/").split("/").pop()!.replace(".md", "");
        if (slug === "grant-tracking-template" || slug === "grant-budget-template") {
          return makeSheetContent(slug);
        }
        return makeMagnetContent(slug, `Title for ${slug}`);
      }),
    ).not.toThrow();
  });
});
