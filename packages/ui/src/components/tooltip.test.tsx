import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

describe("Tooltip", () => {
  it("renders provider metadata and opens content", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Helpful copy</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Hover me" });
    expect(trigger).toHaveAttribute("data-slot", "tooltip-trigger");
    fireEvent.focus(trigger);

    const [tooltipText] = await screen.findAllByText("Helpful copy");
    if (!tooltipText) {
      throw new Error("Expected tooltip text to be rendered");
    }
    expect(tooltipText.closest('[data-slot="tooltip-content"]')).toBeInTheDocument();
  });

  it("uses rounded-2xl container radius on tooltip content", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Explain</TooltipTrigger>
          <TooltipContent>Content radius check</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Explain" }));

    const [tooltipText] = await screen.findAllByText("Content radius check");
    const content = tooltipText?.closest("[data-slot='tooltip-content']");
    expect(content).toHaveClass("rounded-2xl");
    expect(content).not.toHaveClass("rounded-md");
  });

  it("uses calm design-system defaults for app help surfaces", async () => {
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>Explain</TooltipTrigger>
          <TooltipContent>Readable help copy</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Explain" }));

    const [tooltipText] = await screen.findAllByText("Readable help copy");
    const content = tooltipText?.closest("[data-slot='tooltip-content']");
    expect(content).toHaveClass("bg-popover");
    expect(content).toHaveClass("text-popover-foreground");
    expect(content).toHaveClass("border");
    expect(content).toHaveClass("leading-relaxed");
    expect(content).toHaveClass("max-w-72");
    expect(content).not.toHaveClass("bg-foreground");
    expect(content).not.toHaveClass("text-background");
  });
});
