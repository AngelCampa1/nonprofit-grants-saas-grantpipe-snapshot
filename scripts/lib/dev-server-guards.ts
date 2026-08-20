import {
  getLocalApiOrigin,
  getLocalApiPort,
  getLocalWebOrigin,
  getLocalWebPort,
} from "./local-dev-config";

export type ServerRole = "web" | "api";

interface ServerConfig {
  role: ServerRole;
  cwd: string;
  port: number;
  readyUrl: string;
  commandTokens: string[];
  args: string[];
  logFile: string;
}

const SERVER_CONFIGS: Record<ServerRole, ServerConfig> = {
  web: {
    role: "web",
    cwd: "apps/web",
    port: getLocalWebPort(),
    readyUrl: getLocalWebOrigin(),
    commandTokens: ["apps/web", "vite"],
    args: [
      "--dir",
      "apps/web",
      "exec",
      "vite",
      "--host",
      "localhost",
      "--port",
      `${getLocalWebPort()}`,
      "--strictPort",
    ],
    logFile: ".local/dev-servers/web.log",
  },
  api: {
    role: "api",
    cwd: "apps/api",
    port: getLocalApiPort(),
    readyUrl: `${getLocalApiOrigin()}/api/health`,
    commandTokens: ["apps/api", "wrangler", "dev"],
    args: [
      "--dir",
      "apps/api",
      "exec",
      "wrangler",
      "dev",
      "--ip",
      "localhost",
      "--port",
      `${getLocalApiPort()}`,
    ],
    logFile: ".local/dev-servers/api.log",
  },
};

export function getServerConfig(role: ServerRole): ServerConfig {
  return SERVER_CONFIGS[role];
}

export function normalizeCommandLine(commandLine: string): string {
  return commandLine.replaceAll("\\", "/").toLowerCase();
}

export function isOwnedServerCommand(
  commandLine: string | null | undefined,
  repoRoot: string,
  role: ServerRole,
): boolean {
  if (!commandLine) return false;

  const normalized = normalizeCommandLine(commandLine);
  const normalizedRepoRoot = normalizeCommandLine(repoRoot);
  const config = getServerConfig(role);

  return (
    normalized.includes(normalizedRepoRoot) &&
    config.commandTokens.every((token) => normalized.includes(token))
  );
}
