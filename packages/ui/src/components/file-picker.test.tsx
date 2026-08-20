import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilePicker } from "./file-picker";

function makeFile(name = "award-letter.pdf") {
  return new File(["dummy"], name, { type: "application/pdf" });
}

describe("FilePicker", () => {
  it("renders a hidden native file input", () => {
    render(<FilePicker onFileChange={() => {}} />);
    const input = document.querySelector("input[type='file']");
    expect(input).toBeInTheDocument();
    // Visually hidden but still focusable for keyboard users.
    expect(input).toHaveClass("sr-only");
    expect(input).toHaveClass("peer");
  });

  it("renders the trigger as a pill-shaped secondary button label", () => {
    render(<FilePicker onFileChange={() => {}} />);
    const trigger = screen.getByText("Choose file").closest("label");
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveClass("rounded-full");
    expect(trigger?.className).toContain("bg-secondary");
    expect(trigger).toHaveClass("cursor-pointer");
  });

  it("supports a custom button label", () => {
    render(<FilePicker onFileChange={() => {}} buttonLabel="Upload award letter" />);
    expect(screen.getByText("Upload award letter")).toBeInTheDocument();
  });

  it("shows the placeholder, muted, when no file is selected", () => {
    render(<FilePicker onFileChange={() => {}} />);
    const filename = screen.getByText("No file selected");
    expect(filename).toHaveClass("text-muted-foreground");
  });

  it("supports a custom placeholder", () => {
    render(<FilePicker onFileChange={() => {}} placeholder="No document yet" />);
    expect(screen.getByText("No document yet")).toBeInTheDocument();
  });

  it("associates the label with the input via the provided id", () => {
    render(<FilePicker id="award-file" onFileChange={() => {}} />);
    const input = document.querySelector("input[type='file']");
    const trigger = screen.getByText("Choose file").closest("label");
    expect(input).toHaveAttribute("id", "award-file");
    expect(trigger).toHaveAttribute("for", "award-file");
  });

  it("generates an id and links the label when none is provided", () => {
    render(<FilePicker onFileChange={() => {}} />);
    const input = document.querySelector("input[type='file']");
    const trigger = screen.getByText("Choose file").closest("label");
    const generatedId = input?.getAttribute("id");
    expect(generatedId).toBeTruthy();
    expect(trigger).toHaveAttribute("for", generatedId);
  });

  it("calls onFileChange with the selected file and shows its name in foreground", () => {
    const onFileChange = vi.fn();
    render(<FilePicker onFileChange={onFileChange} />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("report.pdf")] } });
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0]).toBeInstanceOf(File);
    const filename = screen.getByText("report.pdf");
    expect(filename).toHaveClass("text-foreground");
  });

  it("clears the native input value after a selection so the same file can be re-picked", () => {
    const onFileChange = vi.fn();
    render(<FilePicker onFileChange={onFileChange} />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("same.pdf")] } });
    // Value is reset, but the displayed name persists from internal state.
    expect(input.value).toBe("");
    expect(screen.getByText("same.pdf")).toBeInTheDocument();
  });

  it("calls onFileChange with null when the selection is cleared", () => {
    const onFileChange = vi.fn();
    render(<FilePicker onFileChange={onFileChange} />);
    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });
    fireEvent.change(input, { target: { files: [] } });
    expect(onFileChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("No file selected")).toBeInTheDocument();
  });

  it("uses the controlled fileName prop over the internal selection", () => {
    render(<FilePicker onFileChange={() => {}} fileName="statement-2026.csv" />);
    expect(screen.getByText("statement-2026.csv")).toHaveClass("text-foreground");
  });

  it("treats an empty controlled fileName as no selection", () => {
    render(<FilePicker onFileChange={() => {}} fileName="" />);
    expect(screen.getByText("No file selected")).toHaveClass("text-muted-foreground");
  });

  it("disables the input when disabled", () => {
    render(<FilePicker onFileChange={() => {}} disabled />);
    expect(document.querySelector("input[type='file']")).toBeDisabled();
  });

  it("forwards the accept attribute", () => {
    render(<FilePicker onFileChange={() => {}} accept=".csv,text/csv" />);
    expect(document.querySelector("input[type='file']")).toHaveAttribute("accept", ".csv,text/csv");
  });

  it("forwards aria-invalid to the input", () => {
    render(<FilePicker onFileChange={() => {}} aria-invalid />);
    expect(document.querySelector("input[type='file']")).toHaveAttribute("aria-invalid", "true");
  });

  it("applies a custom className to the wrapper", () => {
    render(<FilePicker onFileChange={() => {}} className="mt-4" />);
    expect(document.querySelector("[data-slot='file-picker']")).toHaveClass("mt-4");
  });

  it("forwards extra input props such as name", () => {
    render(<FilePicker onFileChange={() => {}} name="evidence" />);
    expect(document.querySelector("input[type='file']")).toHaveAttribute("name", "evidence");
  });
});
