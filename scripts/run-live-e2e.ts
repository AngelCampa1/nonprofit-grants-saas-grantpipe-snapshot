import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildLiveE2EProofEnv,
  createLiveE2ERunProof,
  removeLiveE2ERunProof,
  type LiveE2ERunProof,
} from "./lib/live-e2e-proof";
import { buildCleanupConfig, cleanupWithDatabase } from "./prod-e2e-cleanup";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export type LiveE2ECommand = {
  command: string;
  args: string[];
};

type CleanupFn = () => Promise<void>;
type RunCommandFn = (command: string, args: string[], env?: NodeJS.ProcessEnv) => Promise<number>;

type EnvLike = Record<string, string | undefined>;

export function buildLiveE2EEnv(
  env: NodeJS.ProcessEnv = process.env,
  proof?: LiveE2ERunProof,
): NodeJS.ProcessEnv {
  if (!proof) {
    return {
      ...env,
      GRANTPIPE_LIVE_E2E_WRAPPER: "1",
    };
  }

  return buildLiveE2EProofEnv(env, proof);
}

export function resolveLiveE2ECommand(argv: string[]): LiveE2ECommand {
  const separatorIndex = argv.indexOf("--");
  const command = separatorIndex >= 0 ? argv[separatorIndex + 1] : undefined;
  if (!command) {
    throw new Error("Pass the live E2E command after --.");
  }

  return {
    command,
    args: argv.slice(separatorIndex + 2),
  };
}

function isPublicProductionCommand({ command, args }: LiveE2ECommand): boolean {
  const normalizedArgs = args.map((arg) => arg.replaceAll("\\", "/"));
  const allowedPublicSpecArgs = [[], ["e2e/public-prod-site.spec.ts"]];

  const commandName = command.replaceAll("\\", "/").split("/").pop()?.toLowerCase();
  const commandShape =
    commandName === "pnpm"
      ? normalizedArgs.slice(0, 4).join("\0") ===
        ["exec", "playwright", "test", "--config=playwright.public-prod.config.ts"].join("\0")
        ? normalizedArgs.slice(4)
        : undefined
      : commandName === "playwright"
        ? normalizedArgs.slice(0, 2).join("\0") ===
          ["test", "--config=playwright.public-prod.config.ts"].join("\0")
          ? normalizedArgs.slice(2)
          : undefined
        : undefined;

  return allowedPublicSpecArgs.some(
    (allowedArgs) =>
      commandShape?.length === allowedArgs.length &&
      allowedArgs.every((arg, index) => commandShape[index] === arg),
  );
}

export function assertLiveCommandCanRun(
  command: LiveE2ECommand,
  _env: EnvLike = process.env,
): void {
  if (isPublicProductionCommand(command)) return;
}

export function runCommand(
  command: string,
  args: string[],
  env = buildLiveE2EEnv(),
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error("[live-e2e] failed to spawn command", {
        command,
        error: error instanceof Error ? error.message : String(error),
      });
      resolve(1);
    });
  });
}

export async function cleanupConfirmedProductionE2E(): Promise<void> {
  await cleanupWithDatabase(buildCleanupConfig({ argv: ["--yes"] }));
}

export async function runLiveE2E({
  argv = process.argv,
  cleanup = cleanupConfirmedProductionE2E,
  run = runCommand,
  logError = console.error,
  env = process.env,
}: {
  argv?: string[];
  cleanup?: CleanupFn;
  run?: RunCommandFn;
  logError?: (message: string, error: unknown) => void;
  env?: EnvLike;
} = {}): Promise<number> {
  const liveCommand = resolveLiveE2ECommand(argv);
  const { command, args } = liveCommand;
  assertLiveCommandCanRun(liveCommand, env);
  await cleanup();
  const proof = createLiveE2ERunProof({ rootDir: REPO_ROOT, env });

  let exitCode = 1;
  try {
    exitCode = await run(command, args, buildLiveE2EEnv(env, proof));
  } finally {
    try {
      await cleanup();
    } catch (error) {
      logError("Post-run live E2E cleanup failed.", error);
      if (exitCode === 0) {
        exitCode = 1;
      }
    } finally {
      removeLiveE2ERunProof(proof);
    }
  }

  return exitCode;
}

export async function runCli({
  argv = process.argv,
  scriptUrl = import.meta.url,
  exit = process.exit,
  logError = console.error,
}: {
  argv?: string[];
  scriptUrl?: string;
  exit?: (code: number) => void;
  logError?: (message: unknown) => void;
} = {}): Promise<void> {
  if (scriptUrl !== pathToFileURL(argv[1] ?? "").href) return;

  try {
    exit(await runLiveE2E({ argv }));
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

void runCli();
