import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children: React.ReactNode } & React.HTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href: to, ...props }, children),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return { ...actual };
});

import { AuthLayout } from "./auth-layout";

describe("AuthLayout", () => {
  it("renders the title prop as an h1", () => {
    render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders the subtitle prop when provided", () => {
    render(
      <AuthLayout title="Sign in" subtitle="Welcome back to GrantPipe">
        <div />
      </AuthLayout>,
    );
    expect(screen.getByText("Welcome back to GrantPipe")).toBeInTheDocument();
  });

  it("does not render subtitle element when prop is omitted", () => {
    render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );
    // No <p> with muted-foreground class for subtitle
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument();
  });

  it("renders children inside the form panel", () => {
    render(
      <AuthLayout title="Sign in">
        <input data-testid="email-input" placeholder="Email" />
      </AuthLayout>,
    );
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
  });

  it("renders the footer slot when provided", () => {
    render(
      <AuthLayout title="Sign in" footer={<span data-testid="footer-link">Create account</span>}>
        <div />
      </AuthLayout>,
    );
    expect(screen.getByTestId("footer-link")).toBeInTheDocument();
  });

  it("does not render footer container when footer prop is omitted", () => {
    render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );
    expect(screen.queryByText("Create account")).not.toBeInTheDocument();
  });

  it("renders the brand aside panel (hidden on small screens)", () => {
    const { container } = render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );
    // The aside has aria-hidden
    expect(container.querySelector("aside[aria-hidden]")).toBeInTheDocument();
  });

  it("renders the desktop auth brand logo in the aside panel", () => {
    const { container } = render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );

    expect(
      container.querySelector(
        'aside[aria-hidden] img[alt=""][aria-hidden="true"][src="/brand/grantpipe-logo-on-dark.svg"]',
      ),
    ).toBeInTheDocument();
  });

  it("renders decorative GrantPipe logo images in desktop and mobile auth branding", () => {
    const { container } = render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );

    const logos = Array.from(container.querySelectorAll('img[alt=""][aria-hidden="true"]'));
    const sources = logos.map((logo) => logo.getAttribute("src"));
    // Mobile card sits on a light surface; the desktop aside is dark emerald.
    expect(sources).toContain("/brand/grantpipe-logo-light.svg");
    expect(sources).toContain("/brand/grantpipe-logo-on-dark.svg");
    expect(screen.getByRole("link", { name: "GrantPipe home" })).toBeInTheDocument();
  });

  it("renders the plain-language support copy in the hero panel", () => {
    render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );

    expect(
      screen.getByText("Grant compliance, restricted funds, and audit evidence"),
    ).toBeInTheDocument();
    expect(screen.getByText("Encrypted session")).toBeInTheDocument();
  });

  it("renders the form panel as a <section>", () => {
    const { container } = render(
      <AuthLayout title="Sign in">
        <div />
      </AuthLayout>,
    );
    expect(container.querySelector("section")).toBeInTheDocument();
  });

  it("applies the optional className to the inner form wrapper", () => {
    const { container } = render(
      <AuthLayout title="Sign in" className="extra-class">
        <div />
      </AuthLayout>,
    );
    expect(container.querySelector(".extra-class")).toBeInTheDocument();
  });
});
