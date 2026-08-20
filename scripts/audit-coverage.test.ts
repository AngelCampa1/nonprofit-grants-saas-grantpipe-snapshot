import { execSync } from "child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectCoverageAuditFiles } from "./audit-coverage";

function run(command: string, cwd: string): void {
  execSync(command, { cwd, stdio: "ignore" });
}

describe("collectCoverageAuditFiles", () => {
  it("audits only changed coverage-eligible files", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "grantpipe-audit-coverage-"));

    fs.mkdirSync(path.join(repoRoot, "apps/site/src/config"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "apps/site/src/pages"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "apps/web/src/components"), { recursive: true });

    fs.writeFileSync(path.join(repoRoot, "apps/site/src/config/site.ts"), "export const x = 1;\n");
    fs.writeFileSync(
      path.join(repoRoot, "apps/site/src/pages/example.astro"),
      "<p>not covered</p>\n",
    );
    fs.writeFileSync(
      path.join(repoRoot, "apps/web/src/components/button.tsx"),
      "export const Button = () => null;\n",
    );

    run("git init --initial-branch=master", repoRoot);
    run("git add .", repoRoot);
    run('git -c user.name=test -c user.email=test@example.com commit -m "initial"', repoRoot);

    fs.writeFileSync(
      path.join(repoRoot, "apps/site/src/pages/example.astro"),
      "<p>still not covered</p>\n",
    );
    fs.writeFileSync(
      path.join(repoRoot, "apps/web/src/components/button.tsx"),
      "export const Button = () => <button />;\n",
    );

    expect(collectCoverageAuditFiles(repoRoot)).toEqual(["apps/web/src/components/button.tsx"]);
  });
});
