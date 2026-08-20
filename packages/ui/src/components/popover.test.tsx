import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

describe("Popover", () => {
  it("renders anchor and opens content with custom alignment", () => {
    render(
      <Popover>
        <PopoverAnchor data-testid="anchor" />
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent align="start" sideOffset={8}>
          <PopoverHeader>
            <PopoverTitle>Filters</PopoverTitle>
            <PopoverDescription>Adjust the donor query.</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>,
    );

    expect(screen.getByTestId("anchor")).toHaveAttribute("data-slot", "popover-anchor");
    fireEvent.click(screen.getByRole("button", { name: "Open popover" }));

    expect(screen.getByText("Filters")).toHaveAttribute("data-slot", "popover-title");
    expect(screen.getByText("Adjust the donor query.")).toHaveAttribute(
      "data-slot",
      "popover-description",
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-slot", "popover-content");
  });

  it("PopoverContent has large container rounding (rounded-2xl)", () => {
    render(
      <Popover>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Title</PopoverTitle>
        </PopoverContent>
      </Popover>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toHaveClass("rounded-2xl");
  });
});
