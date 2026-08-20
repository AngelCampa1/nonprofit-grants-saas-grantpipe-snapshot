import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  useNavigate: () => mockNavigate,
}));

import { HomePage } from "./index";

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("replaces the canonical index entry when redirecting to the dashboard", async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true });
    });
  });
});
