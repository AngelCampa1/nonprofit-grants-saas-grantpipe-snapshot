import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  Toaster: ({ theme, className, icons, style }: Record<string, unknown>) => (
    <div
      data-testid="sonner"
      data-theme={String(theme)}
      data-class={String(className)}
      data-has-icons={String(Boolean(icons))}
      data-style={JSON.stringify(style)}
    />
  ),
}));

describe("Toaster", () => {
  it("passes the light theme, icons, and CSS variables into Sonner", async () => {
    const { Toaster } = await import("./sonner");
    render(<Toaster richColors />);

    const toaster = screen.getByTestId("sonner");
    expect(toaster).toHaveAttribute("data-theme", "light");
    expect(toaster).toHaveAttribute("data-class", "toaster group");
    expect(toaster).toHaveAttribute("data-has-icons", "true");
    expect(toaster.getAttribute("data-style")).toContain("--normal-bg");
  });
});
