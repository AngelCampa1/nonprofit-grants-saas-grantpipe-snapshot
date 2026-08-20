import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("renders unchecked by default", () => {
    render(<Switch aria-label="Enable notifications" />);
    const sw = screen.getByRole("switch", { name: "Enable notifications" });
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute("data-slot", "switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("renders checked when defaultChecked is true", () => {
    render(<Switch aria-label="Enable" defaultChecked />);
    const sw = screen.getByRole("switch", { name: "Enable" });
    expect(sw).toHaveAttribute("data-state", "checked");
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("renders disabled state", () => {
    render(<Switch aria-label="Disabled" disabled />);
    expect(screen.getByRole("switch", { name: "Disabled" })).toBeDisabled();
  });

  it("fires onCheckedChange when toggled", () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Toggle" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Toggle" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("merges custom className", () => {
    render(<Switch aria-label="Styled" className="my-switch" />);
    expect(screen.getByRole("switch", { name: "Styled" })).toHaveClass("my-switch");
  });

  it("renders with id and can be associated with a label", () => {
    render(
      <>
        <label htmlFor="email-alerts">Email alerts</label>
        <Switch id="email-alerts" />
      </>,
    );
    const sw = screen.getByRole("switch", { name: "Email alerts" });
    expect(sw).toHaveAttribute("id", "email-alerts");
  });

  it("renders thumb element inside switch", () => {
    render(<Switch aria-label="Notifications" />);
    const thumb = document.querySelector("[data-slot='switch-thumb']");
    expect(thumb).toBeInTheDocument();
  });

  it("renders controlled unchecked state", () => {
    render(<Switch aria-label="Controlled" checked={false} onCheckedChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Controlled" });
    expect(sw).toHaveAttribute("data-state", "unchecked");
  });
});
