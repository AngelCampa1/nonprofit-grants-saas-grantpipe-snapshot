import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { readCssVarValue, useThemeColor } from "./use-theme-color";

function Probe({ varName, fallback }: { varName: string; fallback: string }) {
  const value = useThemeColor(varName, fallback);
  return <span data-testid="probe">{value}</span>;
}

describe("useThemeColor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty("--color-primary");
  });

  it("returns the fallback when the CSS variable resolves to empty", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "",
    } as unknown as CSSStyleDeclaration);

    const { getByTestId } = render(
      <Probe varName="--color-primary" fallback="oklch(0.42 0.13 165)" />,
    );
    expect(getByTestId("probe").textContent).toBe("oklch(0.42 0.13 165)");
  });

  it("reads the resolved CSS custom property from the document root", () => {
    document.documentElement.style.setProperty("--color-primary", "rgb(1, 2, 3)");

    const { getByTestId } = render(<Probe varName="--color-primary" fallback="fallback-value" />);

    expect(getByTestId("probe").textContent).toBe("rgb(1, 2, 3)");
  });

  it("falls back when the computed property is whitespace-only", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "   ",
    } as unknown as CSSStyleDeclaration);

    const { getByTestId } = render(<Probe varName="--color-missing" fallback="fallback-color" />);

    expect(getByTestId("probe").textContent).toBe("fallback-color");
  });

  it("returns the fallback when document is unavailable", () => {
    const originalDocument = globalThis.document;

    vi.stubGlobal("document", undefined);

    expect(readCssVarValue("--color-primary", "fallback-color")).toBe("fallback-color");

    vi.stubGlobal("document", originalDocument);
  });

  it("uses the fallback during server rendering", () => {
    expect(
      renderToStaticMarkup(<Probe varName="--color-primary" fallback="server-fallback" />),
    ).toContain("server-fallback");
  });
});
