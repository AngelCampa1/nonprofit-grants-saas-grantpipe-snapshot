import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

type EnvLike = Record<string, string | undefined>;

export function parseDotEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const rawValue = normalized.slice(separatorIndex + 1).trim();
    const quote = rawValue[0];
    const value =
      (quote === '"' || quote === "'") && rawValue.endsWith(quote)
        ? rawValue.slice(1, -1)
        : rawValue;

    values[key] = value;
  }

  return values;
}

export function loadRootDotEnv({
  env = process.env,
  rootDir = REPO_ROOT,
}: {
  env?: EnvLike;
  rootDir?: string;
} = {}): Record<string, string> {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) {
    return {};
  }

  const parsed = parseDotEnv(readFileSync(envPath, "utf8"));
  const loaded: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
      loaded[key] = value;
    }
  }

  return loaded;
}
