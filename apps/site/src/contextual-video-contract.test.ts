import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const pagesDir = resolve(__dirname, "pages");

function readPage(relPath: string): string {
  return readFileSync(resolve(pagesDir, relPath), "utf-8");
}

const staticPages = [
  { file: "product.astro", path: "/product" },
  { file: "grant-tracking-software.astro", path: "/grant-tracking-software" },
  { file: "grant-compliance-software.astro", path: "/grant-compliance-software" },
  {
    file: "restricted-fund-tracking-software.astro",
    path: "/restricted-fund-tracking-software",
  },
] as const;

describe("contextual video embeds — static pages", () => {
  for (const { file, path } of staticPages) {
    describe(file, () => {
      let src: string;
      try {
        src = readPage(file);
      } catch {
        src = "";
      }

      it("imports getVideoForPage", () => {
        expect(src).toMatch(/getVideoForPage/);
      });

      it("imports videoSchema", () => {
        expect(src).toMatch(/videoSchema/);
      });

      it(`calls getVideoForPage with exact path literal "${path}"`, () => {
        expect(src).toContain(`getVideoForPage("${path}")`);
      });

      it("renders <VideoEmbed", () => {
        expect(src).toMatch(/<VideoEmbed/);
      });

      it("emits videoSchema( in an application/ld+json script", () => {
        expect(src).toMatch(/videoSchema\(/);
        expect(src).toMatch(/application\/ld\+json/);
      });
    });
  }
});

describe("contextual video embeds — free/[slug].astro", () => {
  let src: string;
  try {
    src = readPage("free/[slug].astro");
  } catch {
    src = "";
  }

  it("imports getVideoByLeadMagnet", () => {
    expect(src).toMatch(/getVideoByLeadMagnet/);
  });

  it("calls getVideoByLeadMagnet(", () => {
    expect(src).toMatch(/getVideoByLeadMagnet\(/);
  });

  it("conditionally renders <VideoEmbed (guarded by truthy video)", () => {
    // Must have VideoEmbed AND a conditional guard (&&)
    expect(src).toMatch(/<VideoEmbed/);
    expect(src).toContain("magnetVideo && (");
  });

  it("emits videoSchema( in an application/ld+json script", () => {
    expect(src).toMatch(/videoSchema\(/);
    expect(src).toMatch(/application\/ld\+json/);
  });
});
