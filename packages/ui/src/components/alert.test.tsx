import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "./alert";

describe("Alert", () => {
  it("renders with default variant and children", () => {
    render(<Alert>Something to note.</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("data-slot", "alert");
    expect(alert).toHaveAttribute("data-variant", "default");
    expect(screen.getByText("Something to note.")).toBeInTheDocument();
  });

  it("renders success variant", () => {
    render(<Alert variant="success">All good!</Alert>);
    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "success");
  });

  it("renders warning variant", () => {
    render(<Alert variant="warning">Watch out!</Alert>);
    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "warning");
  });

  it("renders destructive variant", () => {
    render(<Alert variant="destructive">Error occurred.</Alert>);
    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "destructive");
  });

  it("renders info variant with semantic info classes", () => {
    render(<Alert variant="info">FYI</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-variant", "info");
    expect(alert.className).toMatch(/border-info/);
    expect(alert.className).toMatch(/bg-info/);
  });

  it("success variant uses semantic success tokens, not raw green", () => {
    render(<Alert variant="success">Good</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert.className).toMatch(/border-success/);
    expect(alert.className).toMatch(/bg-success/);
    expect(alert.className).not.toMatch(/green-\d/);
  });

  it("warning variant uses semantic warning tokens, not raw amber", () => {
    render(<Alert variant="warning">Careful</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert.className).toMatch(/border-warning/);
    expect(alert.className).toMatch(/bg-warning/);
    expect(alert.className).not.toMatch(/amber-\d/);
  });

  it("renders title when provided", () => {
    render(<Alert title="Heads up">This is important.</Alert>);
    const title = screen.getByText("Heads up");
    expect(title).toHaveAttribute("data-slot", "alert-title");
  });

  it("does not render title element when title is not provided", () => {
    render(<Alert>No title here.</Alert>);
    expect(document.querySelector("[data-slot='alert-title']")).not.toBeInTheDocument();
  });

  it("renders icon in title row when provided", () => {
    render(
      <Alert title="Info" icon={<span data-testid="alert-icon">i</span>}>
        Details here.
      </Alert>,
    );
    expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
  });

  it("renders icon without title", () => {
    render(<Alert icon={<span data-testid="solo-icon">x</span>}>Message here.</Alert>);
    expect(screen.getByTestId("solo-icon")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<Alert className="my-alert">Alert text</Alert>);
    expect(screen.getByRole("alert")).toHaveClass("my-alert");
  });

  it("renders children wrapped in content element", () => {
    render(<Alert>Child content</Alert>);
    const content = document.querySelector("[data-slot='alert-content']");
    expect(content).toBeInTheDocument();
    expect(content).toHaveTextContent("Child content");
  });

  it("does not use border-left accent styling (all-border design)", () => {
    render(<Alert>Check border</Alert>);
    const alert = screen.getByRole("alert");
    // Verify no single-side border classes — design uses border (all sides) via Tailwind
    expect(alert.className).not.toMatch(/border-l-\d/);
    expect(alert.className).not.toMatch(/border-r-\d/);
    // The alert should have the rounded-2xl class confirming all-sides border design
    expect(alert.className).toMatch(/rounded-2xl/);
  });

  it("does not render content element when no children are provided", () => {
    render(<Alert title="Title only" />);
    expect(document.querySelector("[data-slot='alert-content']")).not.toBeInTheDocument();
  });
});
