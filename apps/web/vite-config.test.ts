import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSentryVitePlugin = vi.fn((config: unknown) => ({
  name: "sentry-vite-plugin",
  config,
}));
const mockTanStackRouterVite = vi.fn(() => ({ name: "tanstack-router" }));

vi.mock("@vitejs/plugin-react", () => ({
  default: vi.fn(() => ({ name: "react" })),
}));
vi.mock("@tailwindcss/vite", () => ({
  default: vi.fn(() => ({ name: "tailwindcss" })),
}));
vi.mock("@tanstack/router-plugin/vite", () => ({
  TanStackRouterVite: mockTanStackRouterVite,
}));
vi.mock("@sentry/vite-plugin", () => ({
  sentryVitePlugin: mockSentryVitePlugin,
}));
vi.mock("../scripts/lib/local-dev-config", () => ({
  getLocalApiOrigin: () => "http://localhost:8787",
  getLocalWebPort: () => 5173,
}));

describe("web Vite Sentry source-map config", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSentryVitePlugin.mockClear();
    mockTanStackRouterVite.mockClear();
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_ORG;
    delete process.env.SENTRY_PROJECT_WEB;
  });

  it("enables TanStack route auto code splitting for the app bundle", async () => {
    await import("./vite.config");

    expect(mockTanStackRouterVite).toHaveBeenCalledWith(
      expect.objectContaining({
        autoCodeSplitting: true,
        routeFileIgnorePattern: "\\.(test|spec)\\.(ts|tsx)$",
      }),
    );
  });

  it("splits large vendor families out of the app entry chunk", async () => {
    const config = await import("./vite.config");
    const manualChunks = config.default.build?.rollupOptions?.output?.manualChunks;

    expect(manualChunks).toBeTypeOf("function");
    expect(manualChunks?.("/repo/node_modules/.pnpm/react/index.js", {})).toBe("vendor-react");
    expect(manualChunks?.("/repo/node_modules/.pnpm/@tanstack+react-router/index.js", {})).toBe(
      "vendor-tanstack",
    );
    expect(manualChunks?.("/repo/node_modules/.pnpm/recharts/index.js", {})).toBe("vendor-charts");
    expect(manualChunks?.("/repo/node_modules/.pnpm/lucide-react/index.js", {})).toBe(
      "vendor-icons",
    );
    expect(manualChunks?.("/repo/node_modules/.pnpm/@sentry+react/index.js", {})).toBe(
      "vendor-observability",
    );
  });

  it("keeps source maps disabled when Sentry build env is missing", async () => {
    const config = await import("./vite.config");

    expect(mockSentryVitePlugin).not.toHaveBeenCalled();
    expect(config.default.build?.sourcemap).toBe(false);
  });

  it("enables source-map upload for the web Sentry project when env is present", async () => {
    process.env.SENTRY_AUTH_TOKEN = "token";
    process.env.SENTRY_ORG = "grantpipe";
    process.env.SENTRY_PROJECT_WEB = "grantpipe-web";

    const config = await import("./vite.config");

    expect(mockSentryVitePlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: "token",
        org: "grantpipe",
        project: "grantpipe-web",
        sourcemaps: {
          filesToDeleteAfterUpload: ["dist/**/*.js.map"],
        },
      }),
    );
    expect(config.default.build?.sourcemap).toBe(true);
  });
});
