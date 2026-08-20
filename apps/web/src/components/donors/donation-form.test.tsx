import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DonationForm, buildDonationSubmission } from "./donation-form";
import type { ClassificationResult } from "@grantpipe/shared";

type MockFundsResult = {
  data:
    | {
        data: Array<{ id: string; name: string }>;
        total: number;
        page: number;
        pageSize: number;
      }
    | undefined;
  isLoading: boolean;
};

const mockUseFunds = vi.hoisted(() =>
  vi.fn<
    (params: {
      page: number;
      pageSize: number;
      sortBy: string;
      sortOrder: string;
    }) => MockFundsResult
  >(() => ({
    data: { data: [], total: 0, page: 1, pageSize: 100 },
    isLoading: false,
  })),
);

// Default no-op classifier mutation
const mockMutateAsync = vi.hoisted(() =>
  vi.fn<(params: unknown) => Promise<ClassificationResult>>(),
);

const mockUseClassifyRestriction = vi.hoisted(() =>
  vi.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
);

vi.mock("../../hooks/use-donors", () => ({}));
vi.mock("../../hooks/use-grants", () => ({
  useFunds: mockUseFunds,
}));
vi.mock("../../hooks/use-classify-restriction", () => ({
  useClassifyRestriction: mockUseClassifyRestriction,
}));

const TEMP_RESTRICTED_RESULT: ClassificationResult = {
  netAssetClass: "temporarily_restricted",
  donationRestriction: "restricted",
  restrictionType: "purpose",
  confidence: "high",
  signals: [{ source: "fundType", detail: 'Linked fund type is "temporarily_restricted".' }],
};

const PERMANENT_RESULT: ClassificationResult = {
  netAssetClass: "permanently_restricted",
  donationRestriction: "restricted",
  restrictionType: "purpose",
  confidence: "medium",
  signals: [
    {
      source: "designation",
      detail: 'Designation text matched permanent restriction keyword: "endowment".',
    },
  ],
};

const UNRESTRICTED_RESULT: ClassificationResult = {
  netAssetClass: "unrestricted",
  donationRestriction: "unrestricted",
  restrictionType: "unrestricted",
  confidence: "low",
  signals: [
    { source: "internal", detail: "No restriction signals detected; defaulting to unrestricted." },
  ],
};

describe("DonationForm", () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
    mockMutateAsync.mockReset();
    mockMutateAsync.mockResolvedValue(UNRESTRICTED_RESULT);
    mockUseClassifyRestriction.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });
    mockUseFunds.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 100 },
      isLoading: false,
    });
  });

  it("uses shared donation and restriction constants for schema and labels", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/donors/donation-form.tsx"),
      "utf8",
    );

    expect(source).toContain("DONATION_TYPES");
    expect(source).toContain("RESTRICTION_TYPES");
    expect(source).toContain("DONATION_TYPE_LABELS");
    expect(source).toContain("RESTRICTION_TYPE_LABELS");
    expect(source).not.toContain('z.enum(["one_time", "recurring", "pledge"])');
    expect(source).not.toContain('z.enum(["unrestricted", "restricted"])');
    expect(source).not.toContain('t === "one_time"');
    expect(source).not.toContain('r === "unrestricted"');
  });

  it("renders amount field", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
  });

  it("renders date field", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it("renders donation type label", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByText(/donation type/i)).toBeInTheDocument();
  });

  it("renders restriction label", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByText(/restriction/i)).toBeInTheDocument();
  });

  it("renders designation field", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/donor designation/i)).toBeInTheDocument();
  });

  it("renders payment method field", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument();
  });

  it("renders goods and services fields for quid-pro-quo gifts", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText(/goods or services value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/goods or services description/i)).toBeInTheDocument();
  });

  it("renders notes field", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });

  it("shows validation error when amount is missing", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      // When empty, the min(1) "Amount is required" error fires
      expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
    });
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("shows validation error when amount is zero", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/amount must be positive/i)).toBeInTheDocument();
    });
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it("converts dollar input to cents on submit", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "25.50" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-01-15" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 2550,
        }),
      );
    });
  });

  it("converts date input to an ISO datetime string for the API", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-03-15" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-03-15T00:00:00.000Z",
        }),
      );
    });
  });

  it("populates defaultValues for edit mode, displaying dollars", () => {
    render(
      <DonationForm
        onSubmit={mockOnSubmit}
        defaultValues={{
          amountCents: 5000,
          date: "2026-01-01T00:00:00.000Z",
          type: "one_time",
          restriction: "unrestricted",
        }}
      />,
    );
    // 5000 cents = $50.00 displayed — always two decimal places, never a bare "50".
    expect(screen.getByDisplayValue("50.00")).toBeInTheDocument();
  });

  it("pre-fills fractional dollar amounts with two decimal places", () => {
    render(
      <DonationForm
        onSubmit={mockOnSubmit}
        defaultValues={{
          amountCents: 150,
          date: "2026-01-01T00:00:00.000Z",
          type: "one_time",
          restriction: "unrestricted",
        }}
      />,
    );
    // 150 cents must read as "1.50", not a malformed "1.5".
    expect(screen.getByDisplayValue("1.50")).toBeInTheDocument();
  });

  it("includes payment method and notes when provided on submit", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: "Check" } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "Annual gift" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: "Check",
          notes: "Annual gift",
        }),
      );
    });
  });

  it("submits goods and services value and description when provided", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "150" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText(/goods or services value/i), {
      target: { value: "25.50" },
    });
    fireEvent.change(screen.getByLabelText(/goods or services description/i), {
      target: { value: "Dinner ticket" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 15000,
          goodsServicesValueCents: 2550,
          goodsServicesDescription: "Dinner ticket",
        }),
      );
    });
  });

  it("pre-fills goods and services fields when editing a donation", () => {
    render(
      <DonationForm
        onSubmit={mockOnSubmit}
        defaultValues={{
          amountCents: 15000,
          goodsServicesValueCents: 2500,
          goodsServicesDescription: "Dinner ticket fair market value",
          date: "2026-01-01T00:00:00.000Z",
          type: "one_time",
          restriction: "unrestricted",
        }}
      />,
    );

    expect(screen.getByDisplayValue("25.00")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dinner ticket fair market value")).toBeInTheDocument();
  });

  it("defaults the restriction to unrestricted when building a submission payload", () => {
    expect(
      buildDonationSubmission({
        amountDollars: "12.50",
        date: "2026-06-01",
        type: "one_time",
        restriction: "unrestricted",
      }),
    ).toEqual(
      expect.objectContaining({
        amountCents: 1250,
        date: "2026-06-01T00:00:00.000Z",
        restriction: "unrestricted",
        currency: "USD",
      }),
    );
  });

  it("preserves an explicit restricted donation payload", () => {
    expect(
      buildDonationSubmission({
        amountDollars: "12.50",
        date: "2026-06-01",
        type: "recurring",
        restriction: "restricted",
        paymentMethod: "ACH",
        notes: "Capital campaign",
      }),
    ).toEqual(
      expect.objectContaining({
        amountCents: 1250,
        date: "2026-06-01T00:00:00.000Z",
        restriction: "restricted",
        paymentMethod: "ACH",
        notes: "Capital campaign",
      }),
    );
  });

  it("renders correctly when useFunds returns no data", () => {
    mockUseFunds.mockReturnValue({ data: undefined, isLoading: true });
    render(<DonationForm onSubmit={mockOnSubmit} />);
    // Fund section should not appear when no funds
    expect(document.querySelector("label[for='fundId']")).toBeNull();
  });

  it("renders the fund picker section when funds are available", () => {
    mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-1", name: "General Fund" }], total: 1, page: 1, pageSize: 100 },
      isLoading: false,
    });
    render(<DonationForm onSubmit={mockOnSubmit} />);
    // When funds exist the fund section label should be in the DOM.
    // FormLabel generates a unique htmlFor via useId(), so query by text content.
    const fundLabel = screen.getByText("Fund (optional)");
    expect(fundLabel).not.toBeNull();
  });

  it("includes fundId in the submission payload when provided", () => {
    const result = buildDonationSubmission({
      amountDollars: "10",
      date: "2026-01-01",
      type: "one_time",
      restriction: "unrestricted",
      fundId: "fund-abc",
    });
    expect(result.fundId).toBe("fund-abc");
  });

  it("submits with no fund when fund picker is rendered but no fund is selected", async () => {
    mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-1", name: "General Fund" }], total: 1, page: 1, pageSize: 100 },
      isLoading: false,
    });
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2500 }));
    });
    mockUseFunds.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 100 },
      isLoading: false,
    });
  });

  it("omits fundId from the payload when fundId is not set", () => {
    const result = buildDonationSubmission({
      amountDollars: "10",
      date: "2026-01-01",
      type: "one_time",
      restriction: "unrestricted",
    });
    expect(result).not.toHaveProperty("fundId");
  });

  it("triggers onValueChange for fund select with a real fund id (non-sentinel path)", async () => {
    // Render with funds so the fundId FormField (and its onValueChange) is present
    mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-1", name: "General Fund" }], total: 1, page: 1, pageSize: 100 },
      isLoading: false,
    });
    render(<DonationForm onSubmit={mockOnSubmit} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-01-01" } });

    // Trigger the fund Select's onValueChange with a real fund id via the native select
    const selects = document.querySelectorAll("select");
    const fundSelect = selects[selects.length - 1]!;
    fireEvent.change(fundSelect, { target: { value: "fund-1" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({ fundId: "fund-1" }));
    });
  });

  it("triggers onValueChange for fund select with sentinel value (sentinel → empty string path)", async () => {
    // Covers the v === NO_FUND_SENTINEL ? "" : v truthy branch
    mockUseFunds.mockReturnValue({
      data: { data: [{ id: "fund-1", name: "General Fund" }], total: 1, page: 1, pageSize: 100 },
      isLoading: false,
    });
    render(<DonationForm onSubmit={mockOnSubmit} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-01-01" } });

    const selects = document.querySelectorAll("select");
    const fundSelect = selects[selects.length - 1]!;
    // First pick a fund, then pick the sentinel "__none__" to clear it
    fireEvent.change(fundSelect, { target: { value: "fund-1" } });
    fireEvent.change(fundSelect, { target: { value: "__none__" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      // With sentinel cleared → no fundId in payload
      const call = mockOnSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call).not.toHaveProperty("fundId");
    });
  });

  it("disables submit and shows 'Saving…' label while the form is submitting", async () => {
    let resolveSubmit: (() => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<DonationForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });

    resolveSubmit?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled();
    });
  });

  it("converts the date input to a UTC ISO datetime string for the API", () => {
    const result = buildDonationSubmission({
      amountDollars: "50",
      date: "2024-03-15",
      type: "one_time",
      restriction: "unrestricted",
    });
    expect(result.date).toBe("2024-03-15T00:00:00.000Z");
  });

  // ---------------------------------------------------------------------------
  // buildDonationSubmission — designation and acceptedClassification
  // ---------------------------------------------------------------------------

  it("buildDonationSubmission includes designation when provided", () => {
    const result = buildDonationSubmission({
      amountDollars: "10",
      date: "2026-01-01",
      type: "one_time",
      restriction: "restricted",
      designation: "endowment fund",
    });
    expect(result.designation).toBe("endowment fund");
  });

  it("buildDonationSubmission omits designation when not provided", () => {
    const result = buildDonationSubmission({
      amountDollars: "10",
      date: "2026-01-01",
      type: "one_time",
      restriction: "unrestricted",
    });
    expect(result).not.toHaveProperty("designation");
  });

  it("buildDonationSubmission includes acceptedClassification when provided", () => {
    const result = buildDonationSubmission({
      amountDollars: "10",
      date: "2026-01-01",
      type: "one_time",
      restriction: "restricted",
      acceptedClassification: {
        restrictionType: "purpose",
        title: "Scholarship fund",
        releaseRule: "when purpose fulfilled",
      },
    });
    expect(result.acceptedClassification).toEqual({
      restrictionType: "purpose",
      title: "Scholarship fund",
      releaseRule: "when purpose fulfilled",
    });
  });

  it("buildDonationSubmission omits acceptedClassification when not provided", () => {
    const result = buildDonationSubmission({
      amountDollars: "10",
      date: "2026-01-01",
      type: "one_time",
      restriction: "unrestricted",
    });
    expect(result).not.toHaveProperty("acceptedClassification");
  });

  it("does not call classifier when no fundId, grantId, or designation is set", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    // No fields set that would trigger classification
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("no suggestion banner shown on initial render", () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("includes designation in submission payload when provided", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText(/donor designation/i), {
      target: { value: "for the general program" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ designation: "for the general program" }),
      );
    });
  });

  it("does not include acceptedClassification when no suggestion was applied", async () => {
    render(<DonationForm onSubmit={mockOnSubmit} />);
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      const call = mockOnSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call).not.toHaveProperty("acceptedClassification");
    });
  });

  // ---------------------------------------------------------------------------
  // Restriction Auto-Classifier UX (fake timers for debounce control)
  // ---------------------------------------------------------------------------

  describe("classifier suggestion banner (fake timers)", () => {
    beforeEach(() => {
      // shouldAdvanceTime: true keeps microtask queue (Promises, async) working
      // while still letting us control setTimeout via vi.runAllTimers()
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows suggestion banner after designation is entered and classifier resolves", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "restricted to the youth program" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ designation: "restricted to the youth program" }),
        );
      });
    });

    it("prefills restriction and shows banner when untouched and classifier resolves", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "endowment fund" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => {
        expect(screen.queryByRole("alert")).not.toBeNull();
      });
    });

    it("renders suggestion banner with confidence badge and top signal detail", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "for the youth program" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/temporarily restricted/i)).toBeInTheDocument();
        expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
        expect(screen.getByText(/linked fund type is/i)).toBeInTheDocument();
      });
    });

    it("permanently restricted result shows correct label in banner", async () => {
      mockMutateAsync.mockResolvedValue(PERMANENT_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "endowment" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => {
        expect(screen.getByText(/permanently restricted/i)).toBeInTheDocument();
        expect(screen.getByText(/medium confidence/i)).toBeInTheDocument();
      });
    });

    it("apply suggestion button sets restriction and dismisses banner", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "restricted to youth program" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /apply suggestion/i }));

      await waitFor(() => {
        expect(screen.queryByRole("alert")).toBeNull();
      });
    });

    it("dismiss button removes the suggestion banner", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "for the youth program" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

      await waitFor(() => {
        expect(screen.queryByRole("alert")).toBeNull();
      });
    });

    it("warns when a manual restriction choice conflicts with the classifier", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "for the youth program" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("combobox", { name: "Restriction" }));
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /^Unrestricted$/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("option", { name: /^Unrestricted$/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText(/check this restriction/i)).toBeInTheDocument();
        expect(screen.getByText(/saved records point to a restricted gift/i)).toBeInTheDocument();
      });
    });

    it("includes acceptedClassification in submission when user applies suggestion", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "restricted to youth" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /apply suggestion/i }));

      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            acceptedClassification: expect.objectContaining({
              restrictionType: "purpose",
            }),
          }),
        );
      });
    });

    it("does not call classifier when no designation or fundId is provided", async () => {
      render(<DonationForm onSubmit={mockOnSubmit} />);

      await act(async () => {
        vi.runAllTimers();
      });

      expect(mockMutateAsync).not.toHaveBeenCalled();
    });

    it("classifier error is silently ignored and banner stays hidden", async () => {
      mockMutateAsync.mockRejectedValue(new Error("Network error"));
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "endowment" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());

      // Banner should not appear when classifier errors
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("classifies on a preset fund and titles the term with the fund name", async () => {
      mockUseFunds.mockReturnValue({
        data: {
          data: [{ id: "fund-1", name: "Building Fund" }],
          total: 1,
          page: 1,
          pageSize: 100,
        },
        isLoading: false,
      });
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} defaultValues={{ fundId: "fund-1" }} />);

      await act(async () => {
        vi.runAllTimers();
      });

      // Classifier fires with the fund id and no designation.
      await waitFor(() =>
        expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ fundId: "fund-1" })),
      );
      expect(mockMutateAsync.mock.calls[0]?.[0]).not.toHaveProperty("designation");

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /apply suggestion/i }));

      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            acceptedClassification: expect.objectContaining({ title: "Building Fund" }),
          }),
        );
      });
    });

    it("falls back to the net-asset class label when fund and designation are absent", async () => {
      // Preset fund id not present in the funds list, so no fund name resolves.
      mockUseFunds.mockReturnValue({
        data: { data: [], total: 0, page: 1, pageSize: 100 },
        isLoading: false,
      });
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} defaultValues={{ fundId: "ghost-fund" }} />);

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /apply suggestion/i }));

      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            acceptedClassification: expect.objectContaining({ title: "Temporarily restricted" }),
          }),
        );
      });
    });

    it("ignores a stale classifier response that resolves after a newer one", async () => {
      let resolveFirst!: (r: ClassificationResult) => void;
      mockMutateAsync
        .mockReturnValueOnce(
          new Promise<ClassificationResult>((resolve) => {
            resolveFirst = resolve;
          }),
        )
        .mockResolvedValueOnce(PERMANENT_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      const designation = screen.getByLabelText(/donor designation/i);

      // First request goes in-flight (pending) ...
      fireEvent.change(designation, { target: { value: "scholarship" } });
      await act(async () => {
        vi.runAllTimers();
      });
      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

      // ... then a newer request resolves first and wins the banner.
      fireEvent.change(designation, { target: { value: "endowment" } });
      await act(async () => {
        vi.runAllTimers();
      });
      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText(/permanently restricted/i)).toBeInTheDocument());

      // The stale first response resolves late and must be ignored.
      await act(async () => {
        resolveFirst(TEMP_RESTRICTED_RESULT);
      });

      expect(screen.getByText(/permanently restricted/i)).toBeInTheDocument();
      expect(screen.queryByText(/^Temporarily restricted$/)).toBeNull();
    });

    it("debounces rapid designation edits into a single classify call", async () => {
      mockMutateAsync.mockResolvedValue(TEMP_RESTRICTED_RESULT);
      render(<DonationForm onSubmit={mockOnSubmit} />);

      const designation = screen.getByLabelText(/donor designation/i);
      // Two edits in quick succession: the second must clear the first pending
      // debounce timer so the classifier only fires once.
      fireEvent.change(designation, { target: { value: "for the youth" } });
      fireEvent.change(designation, { target: { value: "for the youth program" } });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ designation: "for the youth program" }),
      );
    });

    it("forwards release rule and dates from the suggestion into acceptedClassification", async () => {
      mockMutateAsync.mockResolvedValue({
        ...TEMP_RESTRICTED_RESULT,
        suggestedReleaseRule: "Release when the youth program concludes",
        suggestedStartDate: "2026-01-01T00:00:00.000Z",
        suggestedEndDate: "2026-12-31T00:00:00.000Z",
      });
      render(<DonationForm onSubmit={mockOnSubmit} />);

      fireEvent.change(screen.getByLabelText(/donor designation/i), {
        target: { value: "restricted to youth" },
      });

      await act(async () => {
        vi.runAllTimers();
      });

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /apply suggestion/i }));

      fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-01" } });
      fireEvent.click(screen.getByRole("button", { name: /save/i }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            acceptedClassification: expect.objectContaining({
              restrictionType: "purpose",
              releaseRule: "Release when the youth program concludes",
              startDate: "2026-01-01T00:00:00.000Z",
              endDate: "2026-12-31T00:00:00.000Z",
            }),
          }),
        );
      });
    });
  });
});
