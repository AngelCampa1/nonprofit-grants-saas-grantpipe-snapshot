import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpTooltip } from "./help-tooltip";

describe("HelpTooltip", () => {
  it("renders an accessible help trigger and opens the help text on focus", async () => {
    render(
      <HelpTooltip label="What is a restricted fund?">
        Money set aside for one purpose.
      </HelpTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "What is a restricted fund?" });
    expect(trigger).toHaveAttribute("data-slot", "help-tooltip-trigger");
    fireEvent.focus(trigger);

    const [content] = await screen.findAllByText("Money set aside for one purpose.");
    expect(content?.closest("[data-slot='tooltip-content']")).toBeInTheDocument();
  });

  it("uses standardized focus ring on trigger (ring-[3px] ring-ring/50, no ring-offset)", () => {
    render(<HelpTooltip label="Focus ring check">Help text</HelpTooltip>);

    const trigger = screen.getByRole("button", { name: "Focus ring check" });
    expect(trigger.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(trigger.className).toMatch(/focus-visible:ring-ring\/50/);
    expect(trigger.className).not.toMatch(/focus-visible:ring-offset/);
  });

  it("sizes explanatory help for readable structured content", async () => {
    render(
      <HelpTooltip label="How do grant statuses work?">
        Use the selected status to show what the team needs to do next.
      </HelpTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "How do grant statuses work?" });
    expect(trigger).toHaveClass("rounded-full");
    expect(trigger).toHaveClass("hover:bg-muted");
    fireEvent.focus(trigger);

    const [content] = await screen.findAllByText(
      "Use the selected status to show what the team needs to do next.",
    );
    const tooltip = content?.closest("[data-slot='tooltip-content']");
    expect(tooltip).toHaveClass("max-w-[min(22rem,calc(100vw-2rem))]");
    expect(tooltip).toHaveClass("text-left");
    expect(tooltip).toHaveClass("leading-relaxed");
  });
});
