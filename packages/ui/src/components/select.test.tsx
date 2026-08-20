import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

describe("Select", () => {
  it("renders trigger metadata and opens the list", async () => {
    render(
      <Select defaultValue="active">
        <SelectTrigger size="sm" aria-label="Status">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectGroup>
            <SelectLabel>Statuses</SelectLabel>
            <SelectItem value="active">Active</SelectItem>
            <SelectSeparator />
            <SelectItem value="closed">Closed</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toHaveAttribute("data-slot", "select-trigger");
    expect(trigger).toHaveAttribute("data-size", "sm");
    fireEvent.click(trigger);

    expect(await screen.findByText("Statuses")).toHaveAttribute("data-slot", "select-label");
    expect(
      screen.getAllByText("Active")[1]?.closest('[data-slot="select-item"]'),
    ).toBeInTheDocument();
  });

  it("trigger is pill-shaped (rounded-full)", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Status">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveClass("rounded-full");
  });

  it("trigger has a hover affordance", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Status">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger).toHaveClass("hover:border-ring/60");
    // The trigger already carries a `transition-[color,box-shadow]` utility;
    // no separate transition-colors utility should be duplicated onto it.
    expect(trigger).toHaveClass("transition-[color,box-shadow]");
  });

  it("trigger uses standardized focus ring", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Status">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "Status" });
    expect(trigger.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(trigger.className).toMatch(/focus-visible:ring-ring\/50/);
  });

  it("supports xs size variant", () => {
    render(
      <Select>
        <SelectTrigger size="xs" aria-label="Status">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveAttribute("data-size", "xs");
  });

  it("supports lg size variant", () => {
    render(
      <Select>
        <SelectTrigger size="lg" aria-label="Status">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveAttribute("data-size", "lg");
  });
});
