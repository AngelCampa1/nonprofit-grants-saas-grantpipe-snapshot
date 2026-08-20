import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
}));

import { AppNotFound } from "./app-not-found";

describe("AppNotFound", () => {
  it("renders the 404 kicker, heading, and explanation", () => {
    render(<AppNotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText(/does not exist or may have been moved/i)).toBeInTheDocument();
  });

  it("offers a way back to the dashboard", () => {
    render(<AppNotFound />);
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
