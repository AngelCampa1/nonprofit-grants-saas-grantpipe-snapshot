import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_SIGNUP_CTA_TARGET } from "../lib/public-signup-cta";

vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));

import PublicSignupCta from "./public-signup-cta";

describe("PublicSignupCta", () => {
  it("renders the product signup CTA target for the current source page", () => {
    render(<PublicSignupCta sourcePage="/resources" />);

    const link = screen.getByRole("link", { name: "Start your 1-month free trial" });

    expect(link.getAttribute("href")).toBe(DEFAULT_PUBLIC_SIGNUP_CTA_TARGET);
  });

  it("prefers explicit CTA text and target overrides", () => {
    render(
      <PublicSignupCta
        sourcePage="/compare"
        ctaText="Read the guide"
        ctaTarget="/resources/guides/privacy"
      />,
    );

    const link = screen.getByRole("link", { name: "Read the guide" });

    expect(link.getAttribute("href")).toBe("/resources/guides/privacy");
  });
});
