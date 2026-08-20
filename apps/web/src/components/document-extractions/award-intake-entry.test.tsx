import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AwardIntakeEntry } from "./award-intake-entry";

const navigate = vi.fn();
const uploadMutateAsync = vi.fn();
const startMutateAsync = vi.fn();
let session: { orgId?: string };
let uploadState: { isPending: boolean; isError: boolean; error: Error | null };
let startState: { isPending: boolean; isError: boolean; error: Error | null };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => session,
}));

vi.mock("../../hooks/use-documents", () => ({
  useUploadDocument: () => ({
    mutateAsync: uploadMutateAsync,
    ...uploadState,
  }),
}));

vi.mock("../../hooks/use-document-extractions", () => ({
  useStartDocumentExtraction: () => ({
    mutateAsync: startMutateAsync,
    ...startState,
  }),
}));

describe("AwardIntakeEntry", () => {
  beforeEach(() => {
    navigate.mockReset();
    uploadMutateAsync.mockReset();
    startMutateAsync.mockReset();
    session = { orgId: "org-1" };
    uploadState = { isPending: false, isError: false, error: null };
    startState = { isPending: false, isError: false, error: null };
  });

  it("renders nothing when the org is missing", () => {
    session = {};

    const { container } = render(<AwardIntakeEntry />);

    expect(container).toBeEmptyDOMElement();
  });

  it("uploads, starts extraction, and navigates to the review route", async () => {
    uploadMutateAsync.mockResolvedValue({ id: "document-1" });
    startMutateAsync.mockResolvedValue({ id: "extraction-1", status: "pending" });

    render(<AwardIntakeEntry />);

    const file = new File(["award"], "award.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/create from award document/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /start intake/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/award-intake/$extractionId",
        params: { extractionId: "extraction-1" },
      });
    });
    expect(uploadMutateAsync).toHaveBeenCalledWith(file);
    expect(startMutateAsync).toHaveBeenCalledWith({
      documentId: "document-1",
      attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("does not submit without a selected file", () => {
    render(<AwardIntakeEntry />);

    expect(screen.getByRole("button", { name: /start intake/i })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText(/create from award document/i).closest("form")!);

    expect(uploadMutateAsync).not.toHaveBeenCalled();
    expect(startMutateAsync).not.toHaveBeenCalled();
  });

  it("displays upload and start errors", () => {
    uploadState = { isPending: false, isError: true, error: new Error("Upload failed") };
    const { rerender } = render(<AwardIntakeEntry />);

    expect(screen.getByText("Upload failed")).toBeVisible();

    uploadState = { isPending: false, isError: false, error: null };
    startState = { isPending: false, isError: true, error: new Error("Start failed") };
    rerender(<AwardIntakeEntry />);

    expect(screen.getByText("Start failed")).toBeVisible();
  });

  it("does not leak an unhandled rejection when upload fails", async () => {
    const onUnhandledRejection = vi.fn();
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    uploadMutateAsync.mockRejectedValue(new Error("Network error"));

    render(<AwardIntakeEntry />);

    const file = new File(["award"], "award.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/create from award document/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /start intake/i }));

    await waitFor(() => {
      expect(uploadMutateAsync).toHaveBeenCalledWith(file);
    });
    // Give any escaping rejection a chance to surface on the microtask/event loop.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onUnhandledRejection).not.toHaveBeenCalled();
    expect(startMutateAsync).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  });

  it("does not leak an unhandled rejection when starting extraction fails", async () => {
    const onUnhandledRejection = vi.fn();
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    uploadMutateAsync.mockResolvedValue({ id: "document-1" });
    startMutateAsync.mockRejectedValue(new Error("Start failed"));

    render(<AwardIntakeEntry />);

    const file = new File(["award"], "award.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/create from award document/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /start intake/i }));

    await waitFor(() => {
      expect(startMutateAsync).toHaveBeenCalledWith({
        documentId: "document-1",
        attemptId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onUnhandledRejection).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  });

  it("reuses the uploaded document and attempt id when extraction start is retried", async () => {
    uploadMutateAsync.mockResolvedValue({ id: "document-1" });
    startMutateAsync
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce({ id: "extraction-1", status: "pending" });

    render(<AwardIntakeEntry />);

    const file = new File(["award"], "award.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/create from award document/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /start intake/i }));
    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /start intake/i }));
    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledTimes(2));

    expect(uploadMutateAsync).toHaveBeenCalledTimes(1);
    expect(startMutateAsync.mock.calls[1]).toEqual(startMutateAsync.mock.calls[0]);
    expect(navigate).toHaveBeenCalledWith({
      to: "/award-intake/$extractionId",
      params: { extractionId: "extraction-1" },
    });
  });

  it("uses compact spacing, clears a selected file, and shows fallback errors", () => {
    uploadState = { isPending: false, isError: true, error: null };
    startState = { isPending: false, isError: true, error: null };

    render(<AwardIntakeEntry compact />);

    const form = screen.getByLabelText(/create from award document/i).closest("form")!;
    expect(form).toHaveClass("space-y-2");
    const file = new File(["award"], "award.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/create from award document/i), {
      target: { files: [file] },
    });
    expect(screen.getByRole("button", { name: /start intake/i })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText(/create from award document/i), {
      target: { files: [] },
    });
    expect(screen.getByRole("button", { name: /start intake/i })).toBeDisabled();
    expect(screen.getByText("Unable to start award intake.")).toBeVisible();
  });
});
