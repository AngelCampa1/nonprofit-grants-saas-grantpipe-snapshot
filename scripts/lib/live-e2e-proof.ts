import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type EnvLike = Record<string, string | undefined>;

export type LiveE2ERunProof = {
  token: string;
  filePath: string;
};

export const LIVE_E2E_WRAPPER_ENV = "GRANTPIPE_LIVE_E2E_WRAPPER";
export const LIVE_E2E_TOKEN_ENV = "GRANTPIPE_LIVE_E2E_RUN_TOKEN";
export const LIVE_E2E_TOKEN_FILE_ENV = "GRANTPIPE_LIVE_E2E_RUN_TOKEN_FILE";

function tokenDir(rootDir: string, env: EnvLike): string {
  return env.GRANTPIPE_LIVE_E2E_TOKEN_DIR?.trim() || join(rootDir, "output", "live-e2e-runs");
}

export function createLiveE2ERunProof({
  rootDir,
  env = process.env,
}: {
  rootDir: string;
  env?: EnvLike;
}): LiveE2ERunProof {
  const token = randomUUID();
  const dir = tokenDir(rootDir, env);
  mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${token}.json`);
  writeFileSync(
    filePath,
    JSON.stringify({
      token,
      createdAt: new Date().toISOString(),
      purpose: "grantpipe-live-e2e-cleanup-proof",
    }),
    { encoding: "utf8", flag: "wx" },
  );

  return { token, filePath };
}

export function removeLiveE2ERunProof(proof: LiveE2ERunProof | undefined): void {
  if (!proof) return;
  rmSync(proof.filePath, { force: true });
}

export function buildLiveE2EProofEnv(
  env: EnvLike = process.env,
  proof: LiveE2ERunProof,
): NodeJS.ProcessEnv {
  return {
    ...env,
    [LIVE_E2E_WRAPPER_ENV]: "1",
    [LIVE_E2E_TOKEN_ENV]: proof.token,
    [LIVE_E2E_TOKEN_FILE_ENV]: proof.filePath,
  };
}

export function assertLiveE2ERunProof(env: EnvLike = process.env): void {
  if (env[LIVE_E2E_WRAPPER_ENV] !== "1") {
    throw new Error("production E2E must run through cleanup: pnpm e2e:live -- <command>");
  }

  const token = env[LIVE_E2E_TOKEN_ENV]?.trim();
  const filePath = env[LIVE_E2E_TOKEN_FILE_ENV]?.trim();
  if (!token || !filePath) {
    throw new Error("production E2E requires a cleanup wrapper run token.");
  }

  if (!existsSync(filePath)) {
    throw new Error("production E2E cleanup wrapper run token file is missing.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error("production E2E cleanup wrapper run token file is invalid.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("token" in parsed) ||
    parsed.token !== token
  ) {
    throw new Error("production E2E cleanup wrapper run token does not match.");
  }
}

export function assertProductionE2ECanMutate({
  targetUrl,
  env = process.env,
}: {
  targetUrl: string;
  env?: EnvLike;
}): void {
  if (new URL(targetUrl).hostname !== "app.grantpipe.com") return;

  assertLiveE2ERunProof(env);
}
