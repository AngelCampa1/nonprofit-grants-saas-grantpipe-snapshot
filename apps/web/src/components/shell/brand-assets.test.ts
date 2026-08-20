import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readPublicAsset(relativePath: string): string {
  return readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../../public", relativePath),
    "utf8",
  );
}

function publicAsset(relativePath: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../public", relativePath);
}

describe("GrantPipe web brand assets", () => {
  it("ships favicon and logo assets referenced by app chrome", () => {
    expect(existsSync(publicAsset("favicon.svg"))).toBe(true);
    expect(existsSync(publicAsset("apple-touch-icon.png"))).toBe(true);
    expect(existsSync(publicAsset("brand/grantpipe-logo-mark.svg"))).toBe(true);
    expect(existsSync(publicAsset("brand/grantpipe-logo-light.svg"))).toBe(true);
    expect(existsSync(publicAsset("brand/grantpipe-logo-on-dark.svg"))).toBe(true);
  });

  it("paints the wordmark for dark surfaces with a light 'Grant' fill", () => {
    const lightLogo = readPublicAsset("brand/grantpipe-logo-light.svg");
    const onDarkLogo = readPublicAsset("brand/grantpipe-logo-on-dark.svg");

    // The light variant paints "Grant" in near-black ink — invisible on dark panels.
    expect(lightLogo).toContain('fill="#0e1a16"');
    // The on-dark variant must NOT use that near-black ink for the wordmark.
    expect(onDarkLogo).not.toContain('fill="#0e1a16"');
    expect(onDarkLogo).toContain('fill="#ffffff"');
    expect(onDarkLogo).toContain('data-wordmark="GrantPipe"');
    expect(onDarkLogo).not.toContain("<text");
    expect(onDarkLogo).not.toContain("font-family");
  });

  it("uses the on-dark wordmark inside the dark auth aside", () => {
    const authLayout = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "auth-layout.tsx"),
      "utf8",
    );

    expect(authLayout).toContain("/brand/grantpipe-logo-on-dark.svg");
  });

  it("links favicon and touch icon assets from the document shell", () => {
    const html = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../index.html"),
      "utf8",
    );

    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });

  it("uses the approved single-green cube mark instead of retired logo fingerprints", () => {
    const mark = readPublicAsset("brand/grantpipe-logo-mark.svg");
    const horizontalLogo = readPublicAsset("brand/grantpipe-logo-light.svg");
    const retiredFingerprints = [
      "ledger-cube",
      "data-ledger-row",
      "M5.6 11 L30.4 11",
      "#0f513f",
      "#145f49",
      "#bf8c2c",
      "#d5a43c",
    ];

    expect(mark).toContain('data-logo-mark="grantpipe-mark"');
    expect(mark).toContain('fill="#047857"');
    expect(mark).toContain('fill="#ffffff"');
    expect(mark).toContain('fill="#d99a18"');
    expect(mark).toContain('data-gold-accent="1"');
    expect(mark).toContain('data-gold-accent="2"');
    expect(mark.match(/fill="#047857"/g)).toHaveLength(3);
    for (const fingerprint of retiredFingerprints) {
      expect(mark).not.toContain(fingerprint);
      expect(horizontalLogo).not.toContain(fingerprint);
    }
    expect(mark).not.toContain("M5.6 11 L30.4 11");
    expect(horizontalLogo).not.toContain("<text");
    expect(horizontalLogo).not.toContain("font-family");
  });
});
