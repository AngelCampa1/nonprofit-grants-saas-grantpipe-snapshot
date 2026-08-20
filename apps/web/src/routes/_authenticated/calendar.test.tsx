import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockCreateFileRoute: vi.fn((path: string) => (config: { beforeLoad: () => void }) => ({
    options: config,
    path,
  })),
  mockRedirect: vi.fn((options: { to: string; replace?: boolean }) => options),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: hoisted.mockCreateFileRoute,
  redirect: hoisted.mockRedirect,
}));

import { Route } from "./calendar";

describe("/_authenticated/calendar redirect shim", () => {
  it("redirects permanently to /deadlines/calendar", () => {
    const beforeLoad = Route.options.beforeLoad as () => void;
    expect(() => beforeLoad()).toThrow();

    let thrown: unknown;
    try {
      beforeLoad();
    } catch (error) {
      thrown = error;
    }

    expect(hoisted.mockRedirect).toHaveBeenCalledWith({
      to: "/deadlines/calendar",
      replace: true,
    });
    expect(thrown).toEqual({ to: "/deadlines/calendar", replace: true });
  });
});
