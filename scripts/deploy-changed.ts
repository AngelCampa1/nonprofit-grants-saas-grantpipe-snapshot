import { execSync } from "child_process";
import { pathToFileURL } from "node:url";
import { getDeployCommands, getDeployTargets } from "./lib/deploy-targets";

type CliOptions = {
  base: string;
  head: string;
  dryRun: boolean;
};

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

export function parseArgs(args: string[]): CliOptions {
  let base = "HEAD@{1}";
  let head = "HEAD";
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (argument === "--base") {
      base = takeValue(args, index, argument);
      index += 1;
      continue;
    }

    if (argument === "--head") {
      head = takeValue(args, index, argument);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return { base, head, dryRun };
}

export function getGitDiffCommand(base: string, head: string): string {
  return `git diff --name-only --diff-filter=ACDMR ${base} ${head}`;
}

export function getChangedFilesFromGitOutput(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }

  return importMetaUrl === pathToFileURL(argvEntry).href;
}

function run(command: string) {
  execSync(command, { stdio: "inherit" });
}

export function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const gitOutput = execSync(getGitDiffCommand(options.base, options.head), {
      encoding: "utf-8",
    });
    const changedFiles = getChangedFilesFromGitOutput(gitOutput);
    const targets = getDeployTargets(changedFiles);
    const commands = getDeployCommands(targets);

    if (changedFiles.length === 0) {
      console.log(`No changed files found between ${options.base} and ${options.head}.`);
      return;
    }

    console.log(`Changed files (${options.base}..${options.head}):`);
    for (const file of changedFiles) {
      console.log(`- ${file}`);
    }

    if (targets.length === 0) {
      console.log("No deployable apps were affected.");
      return;
    }

    console.log(`Deploy targets: ${targets.join(", ")}`);

    if (options.dryRun) {
      console.log("Dry run mode. Commands:");
      for (const command of commands) {
        console.log(`- ${command}`);
      }
      return;
    }

    for (const command of commands) {
      console.log(`Running: ${command}`);
      run(command);
    }
  } catch (error) {
    console.error(formatFailure(error));
    process.exit(1);
  }
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  main();
}
