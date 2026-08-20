import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });
  return {
    ...actual,
    Select: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>,
    SelectTrigger: ({
      "aria-label": ariaLabel,
    }: {
      "aria-label"?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          readOnly={false}
        />
      );
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return (
        <span
          role="option"
          aria-selected={false}
          data-slot="select-item"
          onClick={() => onValueChange(value)}
        >
          {children}
        </span>
      );
    },
  };
});

const mockUseSession = vi.fn();
vi.mock("../hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

const mockFeedbackPost = vi.fn();
const mockCaptureEvent = vi.fn();
vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      feedback: {
        $post: (...args: unknown[]) => mockFeedbackPost(...args),
      },
    },
  },
}));
vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => mockCaptureEvent(...args),
}));

import { FeedbackWidget } from "./feedback-widget";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function okResponse(body: unknown = { success: true }) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function errorResponse(body: unknown = { error: "Failed to send feedback" }, status = 500) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

describe("FeedbackWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      user: { id: "user-1", email: "user@example.com", name: "Test User" },
      orgId: "org-1",
      memberRole: "admin",
      isLoading: false,
    });
    mockFeedbackPost.mockResolvedValue(okResponse());
  });

  it("renders the floating feedback button", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    const button = screen.getByRole("button", { name: /^feedback$/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("hidden");
    expect(button).toHaveClass("md:flex");
  });

  it("opens modal when the button is clicked", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
  });

  it("prefills the reporter email from the session", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(emailInput.value).toBe("user@example.com");
  });

  it("shows a validation error when message is empty", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(screen.getByText(/message is required/i)).toBeInTheDocument();
    });
    expect(mockFeedbackPost).not.toHaveBeenCalled();
  });

  it("submits feedback with the expected payload", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "This is my feedback" },
    });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "bug" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(mockFeedbackPost).toHaveBeenCalledTimes(1);
    });
    const call = mockFeedbackPost.mock.calls[0]?.[0] as { json: Record<string, unknown> };
    expect(call.json.message).toBe("This is my feedback");
    expect(call.json.category).toBe("bug");
    expect(call.json.reporterEmail).toBe("user@example.com");
    expect(typeof call.json.pageUrl).toBe("string");
    expect(typeof call.json.userAgent).toBe("string");
  });

  it("shows a confirmation with reporter email on success", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Thanks for building this" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          (_, el) => el?.textContent === "Thanks. We will reply to user@example.com.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
  });

  it("captures safe analytics after feedback is submitted", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "This is my feedback" },
    });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: "bug" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(mockCaptureEvent).toHaveBeenCalledWith("feedback_submitted", {
        surface: "floating_widget",
        category: "bug",
        message_length_bucket: "1-20",
        has_reply_email: true,
      });
    });
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("This is my feedback");
    expect(JSON.stringify(mockCaptureEvent.mock.calls)).not.toContain("user@example.com");
  });

  it("shows an inline error message when submission fails", async () => {
    mockFeedbackPost.mockResolvedValueOnce(errorResponse({ error: "Something broke" }, 500));
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Broken submission" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/something broke/i);
    });
  });

  it("shows a fallback error when submission rejects with a non-Error value", async () => {
    mockFeedbackPost.mockRejectedValueOnce("network down");
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Rejected non-error" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /something went wrong\. please try again\./i,
      );
    });
  });

  it("resets the form when modal is closed and reopened", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Draft that should not persist" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // reopen
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const textarea = screen.getByLabelText(/message/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("closes the modal when Escape is pressed", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the modal when the backdrop is clicked", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.click(screen.getByTestId("feedback-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses the confirmation when close is clicked and reopens empty", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Send and reopen" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(
        screen.getByText(
          (_, el) => el?.textContent === "Thanks. We will reply to user@example.com.",
        ),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const textarea = screen.getByLabelText(/message/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("falls back to empty email when there is no session user", () => {
    mockUseSession.mockReturnValue({
      user: null,
      orgId: null,
      memberRole: null,
      isLoading: false,
    });
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(emailInput.value).toBe("");
  });

  it("allows editing the prefilled reporter email before submit", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Use a different email" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "other@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(mockFeedbackPost).toHaveBeenCalledTimes(1);
    });
    const call = mockFeedbackPost.mock.calls[0]?.[0] as { json: Record<string, unknown> };
    expect(call.json.reporterEmail).toBe("other@example.com");
  });

  it("shows a validation error when email is empty", async () => {
    mockUseSession.mockReturnValue({
      user: null,
      orgId: null,
      memberRole: null,
      isLoading: false,
    });
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Missing email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    });
    expect(mockFeedbackPost).not.toHaveBeenCalled();
  });

  it("wraps focus backward with Shift+Tab from the first focusable element", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const closeBtn = screen.getByRole("button", { name: /close feedback/i });
    closeBtn.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    // last focusable should have focus now — the submit "Send feedback" button
    expect(document.activeElement?.textContent).toMatch(/send feedback/i);
  });

  it("wraps focus forward with Tab from the last focusable element", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const sendBtn = screen.getByRole("button", { name: /send feedback/i });
    sendBtn.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close feedback");
  });

  it("ignores non-Tab/Escape keys while the modal is open", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("syncs email field when sessionEmail resolves after mount", () => {
    mockUseSession.mockReturnValue({
      user: null,
      orgId: null,
      memberRole: null,
      isLoading: true,
    });
    const { rerender } = render(<FeedbackWidget />, { wrapper: createWrapper() });
    // Session resolves while modal is still closed
    mockUseSession.mockReturnValue({
      user: { id: "user-1", email: "late@example.com", name: "Late User" },
      orgId: "org-1",
      memberRole: "admin",
      isLoading: false,
    });
    rerender(<FeedbackWidget />);
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(emailInput.value).toBe("late@example.com");
  });

  it("clears stale mutation error on resubmit", async () => {
    mockFeedbackPost.mockResolvedValueOnce(errorResponse({ error: "First failure" }, 500));
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Attempt one" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/first failure/i);
    });
    mockFeedbackPost.mockResolvedValueOnce(okResponse());
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Attempt two" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(screen.queryByText(/first failure/i)).not.toBeInTheDocument();
    });
  });

  it("renders a book-a-call link in the success state", async () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Works great!" } });
    fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
    await waitFor(() => {
      expect(
        screen.getByText(
          (_, el) => el?.textContent === "Thanks. We will reply to user@example.com.",
        ),
      ).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: "book a 15-min call" });
    expect(link).toHaveAttribute("href", "https://cal.com/angel-campa-grantpipe/15min");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows the character counter updating with input", () => {
    render(<FeedbackWidget />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: /^feedback$/i }));
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "hello" } });
    expect(screen.getByText(/5\s*\/\s*5000/)).toBeInTheDocument();
  });
});
