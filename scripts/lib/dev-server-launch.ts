import { openSync } from "node:fs";

interface DevServerLaunch {
  command: string;
  args: string[];
}

export function buildDevServerLaunch(platform: NodeJS.Platform, args: string[]): DevServerLaunch {
  if (platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm", ...args],
    };
  }

  return {
    command: "pnpm",
    args,
  };
}

export function buildDetachedLogStdio(logPath: string): ["ignore", number, number] {
  const logFd = openSync(logPath, "a");
  return ["ignore", logFd, logFd];
}
