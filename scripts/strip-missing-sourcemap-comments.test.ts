import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stripMissingSourcemapComments } from "./strip-missing-sourcemap-comments";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "grantpipe-sourcemaps-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("stripMissingSourcemapComments", () => {
  it("removes sourceMappingURL comments only when the referenced map is missing", () => {
    const dir = makeTempDir();
    const validFile = join(dir, "valid.mjs");
    const missingFile = join(dir, "missing.mjs");

    writeFileSync(validFile, "export const ok = true;\n//# sourceMappingURL=valid.mjs.map\n");
    writeFileSync(join(dir, "valid.mjs.map"), "{}\n");
    writeFileSync(missingFile, "export const ok = false;\n//# sourceMappingURL=missing.mjs.map\n");

    const result = stripMissingSourcemapComments(dir);

    expect(result).toEqual({ scanned: 2, updated: 1 });
    expect(readFileSync(validFile, "utf8")).toContain("sourceMappingURL=valid.mjs.map");
    expect(readFileSync(missingFile, "utf8")).toBe("export const ok = false;\n");
  });

  it("walks nested server output directories", () => {
    const dir = makeTempDir();
    const nested = join(dir, "chunks");
    const file = join(nested, "entry.mjs");

    mkdirSync(nested);
    writeFileSync(file, "console.log('entry');\n//# sourceMappingURL=entry.mjs.map\n", {
      flag: "wx",
    });

    const result = stripMissingSourcemapComments(dir);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(readFileSync(file, "utf8")).toBe("console.log('entry');\n");
  });

  it("removes indented sourceMappingURL comments from generated files", () => {
    const dir = makeTempDir();
    const file = join(dir, "entry.mjs");

    writeFileSync(file, "console.log('entry');\n  //# sourceMappingURL=entry.mjs.map\n");

    const result = stripMissingSourcemapComments(dir);

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(readFileSync(file, "utf8")).toBe("console.log('entry');\n");
  });

  it("does not strip sourceMappingURL text embedded inside generated strings", () => {
    const dir = makeTempDir();
    const file = join(dir, "index.mjs");
    const source = [
      "const manifest = {",
      '  scripts: [["faq.ts", "console.log(\\"faq\\");\\n//# sourceMappingURL=faq.ts.map\\n"]]',
      "};",
      "export default manifest;",
      "",
    ].join("\n");

    writeFileSync(file, source);

    const result = stripMissingSourcemapComments(dir);

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect(readFileSync(file, "utf8")).toBe(source);
  });
});
