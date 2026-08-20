import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineError } from "./inline-error";

describe("InlineError", () => {
  it("renders children with an alert role for assistive tech", () => {
    render(<InlineError>Could not save.</InlineError>);
    const box = screen.getByRole("alert");
    expect(box).toBeInTheDocument();
    expect(box).toHaveAttribute("data-slot", "inline-error");
    expect(screen.getByText("Could not save.")).toBeInTheDocument();
  });

  it("applies the soft destructive box styling", () => {
    render(<InlineError>Nope.</InlineError>);
    const box = screen.getByRole("alert");
    expect(box.className).toMatch(/border-destructive/);
    expect(box.className).toMatch(/bg-destructive/);
    expect(box.className).toMatch(/text-destructive/);
  });

  it("merges extra className without dropping the base box styling", () => {
    render(<InlineError className="w-full mt-3">Nope.</InlineError>);
    const box = screen.getByRole("alert");
    expect(box.className).toMatch(/w-full/);
    expect(box.className).toMatch(/mt-3/);
    expect(box.className).toMatch(/border-destructive/);
  });

  it("forwards arbitrary div props", () => {
    render(<InlineError data-testid="recon-error">Nope.</InlineError>);
    expect(screen.getByTestId("recon-error")).toBeInTheDocument();
  });
});
