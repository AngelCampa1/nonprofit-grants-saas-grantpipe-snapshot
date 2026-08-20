import { describe, expect, it, vi } from "vitest";

import {
  DEPLOY_WEB_STEPS,
  SCRIPT_PATH,
  applyWebWranglerViteEnv,
  deployWeb,
  isEntrypoint,
  runCli,
  runDeployCommand,
} from "./deploy-web";

describe("deployWeb", () => {
  it("runs the web deploy steps in order", () => {
    const exec = vi.fn();

    deployWeb({ exec });

    expect(exec.mock.calls.map(([step]) => step)).toEqual(DEPLOY_WEB_STEPS);
  });
});

describe("runDeployCommand", () => {
  it("loads root .env into the command environment before deploying", () => {
    const exec = vi.fn();
    const env = { PATH: "test-path" };
    let dotenvFlagDuringLoad: string | undefined;
    const loadEnv = vi.fn((targetEnv: NodeJS.ProcessEnv) => {
      dotenvFlagDuringLoad = targetEnv.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV;
      targetEnv.CLOUDFLARE_API_TOKEN = "loaded-token";
    });

    runDeployCommand(DEPLOY_WEB_STEPS.at(-1)!, {
      exec,
      env,
      loadEnv,
      readWebWranglerConfig: () =>
        `{
          "vars": {
            "VITE_POSTHOG_KEY": "phc_public_key",
            "VITE_POSTHOG_HOST": "https://us.i.posthog.com"
          }
        }`,
    });

    expect(loadEnv).toHaveBeenCalledWith(env);
    expect(dotenvFlagDuringLoad).toBeUndefined();
    expect(exec).toHaveBeenCalledWith(DEPLOY_WEB_STEPS.at(-1)!.command, {
      stdio: "inherit",
      env: {
        PATH: "test-path",
        CLOUDFLARE_API_TOKEN: "loaded-token",
        VITE_POSTHOG_KEY: "phc_public_key",
        VITE_POSTHOG_HOST: "https://us.i.posthog.com",
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      },
      cwd: expect.stringContaining("grantpipe"),
    });
  });

  it("preserves an explicitly configured Wrangler dotenv loading flag", () => {
    const exec = vi.fn();
    const env = {
      PATH: "test-path",
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "true",
    };

    runDeployCommand(DEPLOY_WEB_STEPS[0]!, {
      exec,
      env,
      loadEnv: vi.fn(),
      readWebWranglerConfig: () => `{"vars":{}}`,
    });

    expect(exec).toHaveBeenCalledWith(DEPLOY_WEB_STEPS[0]!.command, {
      stdio: "inherit",
      env,
      cwd: expect.stringContaining("grantpipe"),
    });
  });

  it("injects public Vite analytics vars from web wrangler config before building", () => {
    const env = { PATH: "test-path" };

    applyWebWranglerViteEnv(
      env,
      `{
        "vars": {
          "VITE_POSTHOG_KEY": "phc_public_key",
          "VITE_POSTHOG_HOST": "https://us.i.posthog.com",
          "OTHER_VAR": "ignored"
        }
      }`,
    );

    expect(env).toEqual({
      PATH: "test-path",
      VITE_POSTHOG_KEY: "phc_public_key",
      VITE_POSTHOG_HOST: "https://us.i.posthog.com",
    });
  });

  it("keeps explicit env Vite vars over wrangler defaults", () => {
    const env = {
      VITE_POSTHOG_KEY: "phc_override",
      VITE_POSTHOG_HOST: "https://override.i.posthog.com",
    };

    applyWebWranglerViteEnv(
      env,
      `{
        "vars": {
          "VITE_POSTHOG_KEY": "phc_public_key",
          "VITE_POSTHOG_HOST": "https://us.i.posthog.com"
        }
      }`,
    );

    expect(env).toEqual({
      VITE_POSTHOG_KEY: "phc_override",
      VITE_POSTHOG_HOST: "https://override.i.posthog.com",
    });
  });

  it("treats blank env Vite vars as missing and uses wrangler defaults", () => {
    const env = {
      VITE_POSTHOG_KEY: " ",
      VITE_POSTHOG_HOST: "",
    };

    applyWebWranglerViteEnv(
      env,
      `{
        "vars": {
          "VITE_POSTHOG_KEY": "phc_public_key",
          "VITE_POSTHOG_HOST": "https://us.i.posthog.com"
        }
      }`,
    );

    expect(env).toEqual({
      VITE_POSTHOG_KEY: "phc_public_key",
      VITE_POSTHOG_HOST: "https://us.i.posthog.com",
    });
  });
});

describe("runCli", () => {
  it("runs deploy when invoked as the script entrypoint", () => {
    const execute = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH],
      execute,
      exit: vi.fn(),
      logError: vi.fn(),
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("isEntrypoint", () => {
  it("matches direct tsx invocation on Windows-style paths", () => {
    expect(
      isEntrypoint("file:///C:/repo/scripts/deploy-web.ts", "C:\\repo\\scripts\\deploy-web.ts"),
    ).toBe(true);
  });
});
