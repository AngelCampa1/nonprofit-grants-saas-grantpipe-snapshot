import { closeSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { getServerConfig, isOwnedServerCommand, type ServerRole } from "./lib/dev-server-guards";
import { buildDetachedLogStdio, buildDevServerLaunch } from "./lib/dev-server-launch";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const stateDir = resolve(repoRoot, ".local/dev-servers");

type DevTarget = ServerRole | "all";
type DevAction = "start" | "stop" | "status";

interface ProcessInfo {
  pid: number;
  commandLine: string;
  localPort: number;
}

function ensureStateDir() {
  mkdirSync(stateDir, { recursive: true });
}

function pidFilePath(role: ServerRole): string {
  return resolve(stateDir, `${role}.pid`);
}

function readPid(role: ServerRole): number | null {
  try {
    return Number.parseInt(readFileSync(pidFilePath(role), "utf8"), 10);
  } catch {
    return null;
  }
}

function writePid(role: ServerRole, pid: number) {
  ensureStateDir();
  writeFileSync(pidFilePath(role), `${pid}`, "utf8");
}

function clearPid(role: ServerRole) {
  rmSync(pidFilePath(role), { force: true });
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getOwnedListeners(role: ServerRole): ProcessInfo[] {
  if (process.platform !== "win32") {
    return [];
  }

  const { port } = getServerConfig(role);
  const script = `
    $listeners = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue
    if ($null -eq $listeners) { @() | ConvertTo-Json -Compress; exit 0 }
    $items = foreach ($listener in $listeners) {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
      if ($null -ne $process) {
        [pscustomobject]@{
          pid = [int]$listener.OwningProcess
          commandLine = [string]$process.CommandLine
          localPort = [int]$listener.LocalPort
        }
      }
    }
    $items | ConvertTo-Json -Compress
  `;

  const raw = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  if (!raw || raw === "null") return [];

  const parsed: unknown = JSON.parse(raw);
  const records = Array.isArray(parsed) ? parsed : [parsed];

  return records
    .filter(
      (item): item is ProcessInfo =>
        typeof item === "object" &&
        item !== null &&
        "pid" in item &&
        "commandLine" in item &&
        "localPort" in item,
    )
    .filter((item) => isOwnedServerCommand(item.commandLine, repoRoot, role));
}

function stopRole(role: ServerRole) {
  const pid = readPid(role);
  if (pid !== null && isPidAlive(pid)) {
    process.kill(pid);
  }

  for (const listener of getOwnedListeners(role)) {
    if (listener.pid !== pid && isPidAlive(listener.pid)) {
      process.kill(listener.pid);
    }
  }

  clearPid(role);
}

function startRole(role: ServerRole) {
  stopRole(role);

  const config = getServerConfig(role);
  ensureStateDir();
  const logPath = resolve(repoRoot, config.logFile);
  writeFileSync(logPath, "", "utf8");
  const launch = buildDevServerLaunch(process.platform, config.args);
  const stdio = buildDetachedLogStdio(logPath);

  const child = spawn(launch.command, launch.args, {
    cwd: repoRoot,
    detached: true,
    stdio,
    shell: false,
  });

  closeSync(stdio[1]);
  writePid(role, child.pid!);
  child.unref();
}

function printStatus(role: ServerRole) {
  const pid = readPid(role);
  const listeners = getOwnedListeners(role);
  const status =
    pid !== null && isPidAlive(pid)
      ? `pid ${pid}`
      : listeners.length > 0
        ? `listener ${listeners.map((item) => item.pid).join(", ")}`
        : "stopped";

  const config = getServerConfig(role);
  console.log(`${role}: ${status} (${config.readyUrl})`);
}

function expandTarget(target: DevTarget): ServerRole[] {
  return target === "all" ? ["api", "web"] : [target];
}

function parseArgs(): { action: DevAction; target: DevTarget } {
  const [, , actionArg, targetArg = "all"] = process.argv;

  if (actionArg !== "start" && actionArg !== "stop" && actionArg !== "status") {
    throw new Error("Usage: pnpm dev:server <start|stop|status> <web|api|all>");
  }

  if (targetArg !== "web" && targetArg !== "api" && targetArg !== "all") {
    throw new Error("Usage: pnpm dev:server <start|stop|status> <web|api|all>");
  }

  return { action: actionArg, target: targetArg };
}

function main() {
  const { action, target } = parseArgs();

  for (const role of expandTarget(target)) {
    if (action === "start") startRole(role);
    if (action === "stop") stopRole(role);
    if (action === "status") printStatus(role);
  }
}

main();
