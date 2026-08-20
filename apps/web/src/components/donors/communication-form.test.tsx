import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommunicationForm } from "./communication-form";

vi.mock("../../hooks/use-donors", () => ({}));

describe("CommunicationForm", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it("renders communication type label", () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByText(/communication type/i)).toBeInTheDocument();
  });

  it("renders subject input", () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
  });

  it("renders body textarea", () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByRole("button", { name: /log communication/i })).toBeInTheDocument();
  });

  it("shows error when both subject and body are empty", async () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /log communication/i }));
    await waitFor(() => {
      expect(screen.getByText(/either subject or body is required/i)).toBeInTheDocument();
    });
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("submits successfully with only a subject", async () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Follow-up call" } });
    fireEvent.click(screen.getByRole("button", { name: /log communication/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Follow-up call",
        }),
      );
    });
  });

  it("submits successfully with only a body", async () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/body/i), {
      target: { value: "Sent thank-you email." },
    });
    fireEvent.click(screen.getByRole("button", { name: /log communication/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "Sent thank-you email.",
        }),
      );
    });
  });

  it("submits with both subject and body", async () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Donor check-in" } });
    fireEvent.change(screen.getByLabelText(/body/i), {
      target: { value: "Discussed upcoming gala." },
    });
    fireEvent.click(screen.getByRole("button", { name: /log communication/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Donor check-in",
          body: "Discussed upcoming gala.",
        }),
      );
    });
  });

  it("disables submit and shows 'Logging…' label while the form is submitting", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<CommunicationForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Quick note" } });
    fireEvent.click(screen.getByRole("button", { name: /log communication/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /logging/i })).toBeDisabled();
    });

    resolveSubmit?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /log communication/i })).not.toBeDisabled();
    });
  });

  it("submits with default type note when not changed", async () => {
    render(<CommunicationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Quick note" } });
    fireEvent.click(screen.getByRole("button", { name: /log communication/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "note",
        }),
      );
    });
  });
});
