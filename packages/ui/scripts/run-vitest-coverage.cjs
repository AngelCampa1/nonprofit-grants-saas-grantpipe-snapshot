const { spawn } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const path = require("node:path");

const tmpDir = path.join(process.cwd(), "coverage", ".tmp");

function ensureCoverageTmpDir() {
  mkdirSync(tmpDir, { recursive: true });
}

ensureCoverageTmpDir();

const keepAlive = setInterval(ensureCoverageTmpDir, 250);

const vitestEntrypoint = require.resolve("vitest/vitest.mjs");
const child = spawn(process.execPath, [vitestEntrypoint, "run", "--coverage", "--maxWorkers=1"], {
  stdio: "inherit",
});

function cleanupAndExit(code) {
  clearInterval(keepAlive);
  ensureCoverageTmpDir();
  process.exit(code ?? 1);
}

child.once("error", (error) => {
  clearInterval(keepAlive);
  console.error(error);
  process.exit(1);
});

child.once("close", cleanupAndExit);
