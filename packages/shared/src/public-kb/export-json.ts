import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getPublicKnowledgeJsonArtifacts } from "./index";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = resolve(packageRoot, "dist/public-kb");

mkdirSync(outputDir, { recursive: true });

for (const fileName of readdirSync(outputDir)) {
  if (fileName.endsWith(".json")) {
    rmSync(resolve(outputDir, fileName));
  }
}

for (const artifact of getPublicKnowledgeJsonArtifacts()) {
  writeFileSync(resolve(outputDir, artifact.fileName), artifact.json, "utf8");
}
