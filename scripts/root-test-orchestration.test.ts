import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("root test orchestration", () => {
  it.each(["test", "test:coverage"])("builds the web artifact before %s", (scriptName) => {
    expect(packageJson.scripts?.[scriptName]).toMatch(
      /^turbo build --filter=@grantpipe\/web --concurrency=1 && turbo test(?::coverage)? --concurrency=1$/,
    );
  });
});
