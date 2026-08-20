import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { pathToFileURL } from "node:url";

import { createDbHandle } from "@grantpipe/db";
import { getDashboardOverview } from "../domains/overview/service";

type EnvLike = Record<string, string | undefined>;
type LoadEnv = (options: { env?: EnvLike; rootDir: string }) => void;

type ProofOptions = {
  env?: EnvLike;
  loadEnv?: LoadEnv;
  openDatabase?: typeof createDbHandle;
  getDashboard?: typeof getDashboardOverview;
  write?: (message: string) => void;
};

export function loadIgnoredRootEnv({ rootDir }: { rootDir: string }): void {
  loadEnvFile(resolve(rootDir, ".env"));
}

export async function runDashboardReadonlyProof({
  env = process.env,
  loadEnv = loadIgnoredRootEnv,
  openDatabase = createDbHandle,
  getDashboard = getDashboardOverview,
  write = (message) => process.stdout.write(message),
}: ProofOptions = {}): Promise<void> {
  loadEnv({
    env,
    rootDir: env.GRANTPIPE_DASHBOARD_PROOF_ENV_ROOT ?? process.cwd(),
  });

  const databaseUrl = env.DATABASE_URL;
  const orgId = env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID;
  const entityId = env.GRANTPIPE_DASHBOARD_PROOF_ENTITY_ID;
  if (!databaseUrl || !orgId || !entityId) {
    throw new Error("Dashboard proof configuration is missing");
  }

  const { db, close } = await openDatabase(databaseUrl);
  try {
    const dashboard = await getDashboard(db, { orgId, entityId });
    if (!Array.isArray(dashboard.recentActivity)) {
      throw new Error("Dashboard proof contract failed");
    }
    write("PROD_READ_ONLY_DASHBOARD_OK\n");
  } finally {
    await close();
  }
}

export async function runDashboardReadonlyProofCli({
  run = runDashboardReadonlyProof,
  writeError = (message: string) => process.stderr.write(message),
}: {
  run?: () => Promise<void>;
  writeError?: (message: string) => void;
} = {}): Promise<number> {
  try {
    await run();
    return 0;
  } catch {
    writeError("PROD_READ_ONLY_DASHBOARD_FAILED\n");
    return 1;
  }
}

/* v8 ignore start -- exercised by invoking the committed verifier command */
const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
  runDashboardReadonlyProofCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
/* v8 ignore stop */
