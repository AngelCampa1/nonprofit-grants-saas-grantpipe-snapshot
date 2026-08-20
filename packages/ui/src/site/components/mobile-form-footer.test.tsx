import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileFormFooter } from "./mobile-form-footer";

describe("MobileFormFooter", () => {
  it("renders the primary button with the given label", () => {
    render(<MobileFormFooter primaryLabel="Next" onPrimary={() => undefined} />);
    const btn = screen.getByRole("button", { name: "Next" });
    expect(btn).toBeDefined();
  });

  it("renders the primary CTA as a pill without a square radius utility", () => {
    render(<MobileFormFooter primaryLabel="Next" onPrimary={() => undefined} />);
    const btn = screen.getByRole("button", { name: "Next" });
    // btn-primary supplies the pill radius via token; assert the pill class is
    // present and that no literal square-radius utility overrides it.
    expect(btn.className).toContain("btn-primary");
    expect(btn.className).not.toContain("rounded-md");
    expect(btn.className).not.toContain("rounded-lg");
  });

  it("calls onPrimary when primary button clicked", () => {
    const onPrimary = vi.fn();
    render(<MobileFormFooter primaryLabel="Submit" onPrimary={onPrimary} />);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onPrimary).toHaveBeenCalledOnce();
  });

  it("primary button is disabled when primaryDisabled=true", () => {
    render(
      <MobileFormFooter primaryLabel="Next" onPrimary={() => undefined} primaryDisabled={true} />,
    );
    const btn = screen.getByRole("button", { name: "Next" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("does not render secondary button when secondaryLabel is omitted", () => {
    render(<MobileFormFooter primaryLabel="Begin" onPrimary={() => undefined} />);
    // Only one button: the primary.
    expect(screen.getAllByRole("button").length).toBe(1);
  });

  it("renders secondary button when secondaryLabel and onSecondary are provided", () => {
    render(
      <MobileFormFooter
        primaryLabel="Next"
        onPrimary={() => undefined}
        secondaryLabel="Back"
        onSecondary={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
  });

  it("renders the secondary Back control as a pill with a mobile-safe touch target", () => {
    render(
      <MobileFormFooter
        primaryLabel="Next"
        onPrimary={() => undefined}
        secondaryLabel="Back"
        onSecondary={() => undefined}
      />,
    );
    const backBtn = screen.getByRole("button", { name: "Back" });
    // Buttons-are-pills canon: this is the Back control mobile users actually
    // tap (the inline desktop Back is hidden below sm:). It must be a pill with
    // a ≥44px touch target, matching the inline Back.
    expect(backBtn.className).toContain("rounded-full");
    expect(backBtn.className).toContain("min-h-12");
  });

  it("calls onSecondary when secondary button clicked", () => {
    const onSecondary = vi.fn();
    render(
      <MobileFormFooter
        primaryLabel="Next"
        onPrimary={() => undefined}
        secondaryLabel="Back"
        onSecondary={onSecondary}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onSecondary).toHaveBeenCalledOnce();
  });

  it("secondary button is disabled when secondaryDisabled=true", () => {
    render(
      <MobileFormFooter
        primaryLabel="Next"
        onPrimary={() => undefined}
        secondaryLabel="Back"
        secondaryDisabled={true}
        onSecondary={() => undefined}
      />,
    );
    const backBtn = screen.getByRole("button", { name: "Back" }) as HTMLButtonElement;
    expect(backBtn.disabled).toBe(true);
  });

  it("root element has data-mobile-form-footer attribute", () => {
    const { container } = render(
      <MobileFormFooter primaryLabel="Next" onPrimary={() => undefined} />,
    );
    expect(container.querySelector("[data-mobile-form-footer]")).toBeTruthy();
  });

  it("applies additional className to root element", () => {
    const { container } = render(
      <MobileFormFooter primaryLabel="Next" onPrimary={() => undefined} className="extra-class" />,
    );
    const root = container.querySelector("[data-mobile-form-footer]") as HTMLElement;
    expect(root.className).toContain("extra-class");
  });

  it("does not render secondary button when secondaryLabel is provided but onSecondary is omitted", () => {
    render(
      <MobileFormFooter primaryLabel="Next" onPrimary={() => undefined} secondaryLabel="Back" />,
    );
    // Secondary button should not render without onSecondary handler.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getAllByRole("button").length).toBe(1);
  });
});
