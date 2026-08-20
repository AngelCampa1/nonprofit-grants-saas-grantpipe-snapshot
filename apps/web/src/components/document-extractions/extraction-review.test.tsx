import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractionReview } from "./extraction-review";
import type { DocumentExtractionDetail } from "../../hooks/use-document-extractions";

const mutateAction = vi.fn();
const mutateCommit = vi.fn();
const navigate = vi.fn();
let extraction: DocumentExtractionDetail;
let queryState: { isLoading: boolean; isError: boolean };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("../../hooks/use-document-extractions", () => ({
  useDocumentExtraction: () => ({
    data: extraction,
    isLoading: queryState.isLoading,
    isError: queryState.isError,
  }),
  useRecordDocumentExtractionAction: () => ({
    mutate: mutateAction,
    isPending: false,
  }),
  useCommitDocumentExtraction: () => ({
    mutate: mutateCommit,
    isPending: false,
  }),
}));

const SelectCtx = React.createContext<{
  value: string;
  onValueChange: (v: string) => void;
}>({ value: "", onValueChange: () => {} });

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
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
      id,
      children: _children,
    }: {
      "aria-label"?: string;
      id?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
          aria-label={ariaLabel ?? id}
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

describe("ExtractionReview", () => {
  beforeEach(() => {
    mutateAction.mockReset();
    mutateCommit.mockReset();
    navigate.mockReset();
    queryState = { isLoading: false, isError: false };
    extraction = {
      id: "extraction-1",
      documentId: "document-1",
      status: "ready_for_review",
      fields: [
        {
          id: "field-1",
          fieldKey: "grant.name",
          section: "grant_basics",
          destinationEntityType: "grant",
          destinationField: "name",
          valueJson: "Youth Program Award",
          normalizedValueJson: "Youth Program Award",
          confidence: 92,
          status: "accepted",
          required: true,
          sources: [{ pageNumber: 1, snippet: "Award: Youth Program Award" }],
        },
      ],
    };
  });

  it("renders loading and error states", () => {
    queryState = { isLoading: true, isError: false };
    const { rerender } = render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByText(/loading award intake/i)).toBeVisible();

    queryState = { isLoading: false, isError: true };
    rerender(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByText(/unable to load award intake/i)).toBeVisible();
  });

  it("renders pending, failed, and committed states", () => {
    extraction = { ...extraction, status: "processing" };
    const { rerender } = render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByText(/extracting award document/i)).toBeVisible();

    extraction = { ...extraction, status: "provider_result_pending" };
    rerender(<ExtractionReview extractionId="extraction-1" />);
    expect(screen.getByText(/extracting award document/i)).toBeVisible();

    extraction = { ...extraction, status: "failed", failureMessage: "OCR timed out" };
    rerender(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByText("OCR timed out")).toBeVisible();

    extraction = { ...extraction, status: "committed", createdGrantId: "grant-1" };
    rerender(<ExtractionReview extractionId="extraction-1" />);
    fireEvent.click(screen.getByRole("button", { name: /open grant/i }));

    expect(screen.getByText(/award intake has been committed/i)).toBeVisible();
    expect(navigate).toHaveBeenCalledWith({
      to: "/grants/$grantId",
      params: { grantId: "grant-1" },
    });

    extraction = { ...extraction, status: "failed", failureMessage: null };
    rerender(<ExtractionReview extractionId="extraction-1" />);
    expect(screen.getByText("Award intake failed.")).toBeVisible();

    extraction = { ...extraction, status: "committed", createdGrantId: null };
    rerender(<ExtractionReview extractionId="extraction-1" />);
    expect(screen.queryByRole("button", { name: /open grant/i })).not.toBeInTheDocument();
  });

  it("renders nothing when no extraction payload is available", () => {
    extraction = undefined as unknown as DocumentExtractionDetail;
    const { container } = render(<ExtractionReview extractionId="extraction-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("requires explicit duplicate decisions before commit", () => {
    render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByRole("button", { name: /commit reviewed setup/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(mutateCommit).toHaveBeenCalledWith(
      {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "Youth Program Award" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("commits map-existing decisions with manually entered basics", () => {
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/^grant name$/i), {
      target: { value: "Manual Award" },
    });
    // The reviewer types a dollar amount; the wire payload stays integer cents.
    fireEvent.change(screen.getByLabelText(/^award amount$/i), {
      target: { value: "123.45" },
    });
    fireEvent.change(screen.getByLabelText(/grant start date/i), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/grant end date/i), {
      target: { value: "2026-12-31" },
    });
    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "map_existing" },
    });
    fireEvent.change(screen.getByLabelText(/^existing funder$/i), {
      target: { value: "funder-1" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "map_existing" },
    });
    fireEvent.change(screen.getByLabelText(/^existing grant$/i), {
      target: { value: "grant-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(mutateCommit).toHaveBeenCalledWith(
      {
        funderDecision: { action: "map_existing", existingId: "funder-1" },
        grantDecision: { action: "map_existing", existingId: "grant-1" },
        requiredGrantBasics: {
          name: "Manual Award",
          amountCents: 12345,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("blocks commit when the grant end date precedes the start date", () => {
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/^grant name$/i), {
      target: { value: "Backwards Award" },
    });
    fireEvent.change(screen.getByLabelText(/grant start date/i), {
      target: { value: "2026-12-31" },
    });
    fireEvent.change(screen.getByLabelText(/grant end date/i), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(screen.getByText("End date must be on or after the start date.")).toBeInTheDocument();
    expect(mutateCommit).not.toHaveBeenCalled();
  });

  it("omits invalid optional amount and date values on commit", () => {
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/^award amount$/i), {
      target: { value: "-100" },
    });
    fireEvent.change(screen.getByLabelText(/grant start date/i), {
      target: { value: "not-a-date" },
    });
    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(mutateCommit).toHaveBeenCalledWith(
      {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: { name: "Youth Program Award" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("submits edit and map existing field actions", () => {
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/edit grant.name/i), {
      target: { value: "Edited award name" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save edit/i }));
    expect(mutateAction).toHaveBeenCalledWith(
      {
        fieldId: "field-1",
        action: "edit",
        nextValue: "Edited award name",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    fireEvent.change(screen.getByLabelText(/mapped entity id/i), {
      target: { value: "grant-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^map$/i }));
    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-1",
        action: "map_existing",
        mappedEntityType: "grant",
        mappedEntityId: "grant-2",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    fireEvent.click(screen.getByRole("button", { name: "accept" }));
    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-1",
        action: "accept",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "reject" }));
    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-1",
        action: "reject",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    fireEvent.click(screen.getByRole("button", { name: "defer" }));
    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-1",
        action: "defer",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("renders low confidence, object values, and missing source page fallback", () => {
    extraction.fields = [
      {
        id: "field-low",
        fieldKey: "grant.terms",
        section: "restrictions",
        destinationEntityType: "grant",
        destinationField: "restriction_term",
        valueJson: { title: "Program Cost Restriction", releaseRule: "N/A" },
        confidence: 42,
        status: "accepted",
        required: false,
        sources: [{ pageNumber: null, snippet: "about one hundred dollars" }],
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByText("42% confidence")).toBeVisible();
    // Structured object values render as labeled, editable sub-fields — never
    // as a raw brace-delimited JSON literal the reviewer would have to parse.
    expect(screen.getByLabelText(/edit title \(grant.terms\)/i)).toHaveValue(
      "Program Cost Restriction",
    );
    expect(screen.getByLabelText(/edit release rule \(grant.terms\)/i)).toHaveValue("N/A");
    expect(screen.queryByText(/\{.*\}/)).not.toBeInTheDocument();
    // With no page number, the citation shows the snippet alone — never "Page ?".
    expect(screen.getByText("about one hundred dollars")).toBeVisible();
    expect(screen.queryByText(/Page \?/)).not.toBeInTheDocument();
  });

  it("shows a Not extracted state instead of a confidence percentage for an empty field", () => {
    extraction.fields = [
      {
        id: "field-null",
        fieldKey: "grant.endDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "endDate",
        valueJson: null,
        normalizedValueJson: null,
        confidence: 85,
        status: "deferred",
        required: true,
        sources: [],
      },
      {
        id: "field-blank",
        fieldKey: "grant.startDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "startDate",
        valueJson: "   ",
        normalizedValueJson: null,
        confidence: 73,
        status: "deferred",
        required: false,
        sources: [],
      },
      {
        id: "field-empty-object",
        fieldKey: "grant.terms",
        section: "restrictions",
        destinationEntityType: "grant",
        destinationField: "restriction_term",
        valueJson: {},
        normalizedValueJson: null,
        confidence: 90,
        status: "deferred",
        required: false,
        sources: [],
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    // None of these fields carry a real value (null, whitespace-only string,
    // empty object), so claiming a confidence percentage would imply the model
    // extracted something it did not. Each shows an explicit Not extracted badge.
    expect(screen.getAllByText("Not extracted")).toHaveLength(3);
    expect(screen.queryByText("85% confidence")).not.toBeInTheDocument();
    expect(screen.queryByText("73% confidence")).not.toBeInTheDocument();
    expect(screen.queryByText("90% confidence")).not.toBeInTheDocument();
    // Scalar empties show a visible placeholder instead of an invisible empty
    // paragraph; the empty object is edited through its sub-field inputs.
    expect(screen.getAllByText("Not extracted from the document")).toHaveLength(2);
  });

  it("edits object fields with labeled sub-field inputs instead of raw JSON", () => {
    extraction.fields = [
      {
        id: "field-obj",
        fieldKey: "grant.terms",
        section: "restrictions",
        destinationEntityType: "grant",
        destinationField: "restriction_term",
        valueJson: { title: "Program Cost Restriction", releaseRule: "On final report" },
        confidence: 64,
        status: "accepted",
        required: false,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    // No raw-JSON single-line editor for object fields — the reviewer never
    // has to hand-edit a brace-delimited literal.
    expect(screen.queryByLabelText(/^edit grant.terms$/i)).not.toBeInTheDocument();

    const titleInput = screen.getByLabelText(/edit title \(grant.terms\)/i);
    const ruleInput = screen.getByLabelText(/edit release rule \(grant.terms\)/i);
    expect(titleInput).toHaveValue("Program Cost Restriction");
    expect(ruleInput).toHaveValue("On final report");

    fireEvent.change(titleInput, { target: { value: "Indirect Cost Cap" } });
    fireEvent.click(screen.getByRole("button", { name: /save edit/i }));

    // Save reassembles the full object, preserving the untouched sub-field.
    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-obj",
        action: "edit",
        nextValue: { title: "Indirect Cost Cap", releaseRule: "On final report" },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("renders friendly labels, formatted money, and numbered citations", () => {
    extraction.fields = [
      {
        id: "field-amount",
        fieldKey: "grant.amountCents",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "amountCents",
        valueJson: 25000000,
        normalizedValueJson: 25000000,
        confidence: 100,
        status: "accepted",
        required: true,
        sources: [{ pageNumber: 2, snippet: "Grant Amount: $250,000.00" }],
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    // Label is human-readable, not the raw "grant.amountCents" code path.
    expect(screen.getByText("Award amount")).toBeVisible();
    expect(screen.queryByText("grant.amountCents")).not.toBeInTheDocument();
    // Cents are formatted as currency for the reader.
    expect(screen.getByText("$250,000.00")).toBeVisible();
    expect(screen.queryByText("25000000")).not.toBeInTheDocument();
    // A known page number is shown.
    expect(screen.getByText(/Page 2: Grant Amount/)).toBeVisible();
  });

  it("edits the award amount in dollars and saves it back as integer cents", () => {
    extraction.fields = [
      {
        id: "field-amount",
        fieldKey: "grant.amountCents",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "amountCents",
        valueJson: 32500000,
        normalizedValueJson: 32500000,
        confidence: 100,
        status: "accepted",
        required: true,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    // The editable money field is pre-filled in dollars, never raw cents.
    const amountEditor = screen.getByLabelText(/edit award amount in dollars/i);
    expect(amountEditor).toHaveValue("325000.00");
    expect(screen.queryByLabelText(/edit grant.amountCents/i)).not.toBeInTheDocument();

    fireEvent.change(amountEditor, { target: { value: "400000.50" } });
    fireEvent.click(screen.getByRole("button", { name: /save edit/i }));

    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-amount",
        action: "edit",
        nextValue: 40000050,
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("blocks saving the award amount when the dollar value is not a positive number", () => {
    extraction.fields = [
      {
        id: "field-amount",
        fieldKey: "grant.amountCents",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "amountCents",
        valueJson: 32500000,
        normalizedValueJson: 32500000,
        confidence: 100,
        status: "accepted",
        required: true,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    const amountEditor = screen.getByLabelText(/edit award amount in dollars/i);
    fireEvent.change(amountEditor, { target: { value: "0" } });
    expect(screen.getByRole("button", { name: /save edit/i })).toBeDisabled();

    fireEvent.change(amountEditor, { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: /save edit/i })).toBeDisabled();
  });

  it("shows a plain dollar placeholder for the manual amount field when nothing was extracted", () => {
    render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByLabelText("Award amount")).toHaveAttribute("placeholder", "Award amount");
  });

  it("renders primitive values, fallback placeholders, and mapped entity type changes", () => {
    extraction.fields = [
      {
        id: "field-boolean",
        fieldKey: "grant.active",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "active",
        valueJson: true,
        normalizedValueJson: false,
        confidence: 80,
        status: "deferred",
        required: false,
      },
      {
        id: "field-date",
        fieldKey: "grant.startDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "startDate",
        valueJson: "not-a-date",
        normalizedValueJson: "not-a-date",
        confidence: 80,
        status: "accepted",
        required: false,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByText("false")).toBeVisible();
    expect(screen.getByLabelText("Grant name")).toHaveAttribute("placeholder", "Grant name");
    expect(screen.getByLabelText("Grant start date")).toHaveAttribute("placeholder", "Start date");
    fireEvent.change(screen.getByLabelText(/mapped entity type for grant.active/i), {
      target: { value: "fund" },
    });
    fireEvent.change(screen.getByLabelText(/mapped entity ID for grant.active/i), {
      target: { value: "fund-1" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^map$/i })[0]!);
    expect(mutateAction).toHaveBeenLastCalledWith(
      {
        fieldId: "field-boolean",
        action: "map_existing",
        mappedEntityType: "fund",
        mappedEntityId: "fund-1",
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("surfaces an inline error when the commit mutation fails", () => {
    mutateCommit.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error("Commit rejected by server"));
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Commit rejected by server");
  });

  it("shows a fallback message when the commit rejects with a non-Error", () => {
    mutateCommit.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.("boom");
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to commit award setup.");
  });

  it("surfaces an inline error when a field review action fails", () => {
    mutateAction.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error("Action rejected by server"));
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.click(screen.getByRole("button", { name: "accept" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Action rejected by server");
  });

  it("shows a fallback message when a field action rejects with a non-Error", () => {
    mutateAction.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.("boom");
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.click(screen.getByRole("button", { name: "accept" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to record review action.");
  });

  it("clears a prior mutation error when a new action succeeds", () => {
    mutateAction.mockImplementationOnce(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error("Action rejected by server"));
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.click(screen.getByRole("button", { name: "accept" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Action rejected by server");

    fireEvent.click(screen.getByRole("button", { name: "reject" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("commits accepted dates from valueJson when the model omits a normalized value", () => {
    extraction.fields = [
      {
        id: "field-name",
        fieldKey: "grant.name",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "name",
        valueJson: "Mobile Dental Outreach Expansion",
        confidence: 100,
        status: "accepted",
        required: true,
      },
      {
        id: "field-start",
        fieldKey: "grant.startDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "startDate",
        valueJson: "2026-07-01",
        normalizedValueJson: null,
        confidence: 100,
        status: "accepted",
        required: false,
      },
      {
        id: "field-end",
        fieldKey: "grant.endDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "endDate",
        valueJson: "2027-06-30",
        normalizedValueJson: null,
        confidence: 100,
        status: "accepted",
        required: false,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(mutateCommit).toHaveBeenCalledWith(
      {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Mobile Dental Outreach Expansion",
          startDate: "2026-07-01T00:00:00.000Z",
          endDate: "2027-06-30T00:00:00.000Z",
        },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("commits natural-language dates the model emits instead of dropping them", () => {
    extraction.fields = [
      {
        id: "field-name",
        fieldKey: "grant.name",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "name",
        valueJson: "Mobile Dental Outreach Expansion",
        confidence: 100,
        status: "accepted",
        required: true,
      },
      {
        id: "field-start",
        fieldKey: "grant.startDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "startDate",
        valueJson: "July 1, 2026",
        normalizedValueJson: null,
        confidence: 100,
        status: "accepted",
        required: false,
      },
      {
        id: "field-end",
        fieldKey: "grant.endDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "endDate",
        valueJson: "June 30, 2027",
        normalizedValueJson: null,
        confidence: 100,
        status: "accepted",
        required: false,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(mutateCommit).toHaveBeenCalledWith(
      {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Mobile Dental Outreach Expansion",
          startDate: "2026-07-01T00:00:00.000Z",
          endDate: "2027-06-30T00:00:00.000Z",
        },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("keeps commit disabled until every required and low-confidence field is reviewed", () => {
    extraction.fields = [
      {
        id: "field-name",
        fieldKey: "grant.name",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "name",
        valueJson: "Youth Program Award",
        normalizedValueJson: "Youth Program Award",
        confidence: 92,
        status: "accepted",
        required: true,
      },
      {
        id: "field-amount",
        fieldKey: "grant.amountCents",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "amountCents",
        valueJson: 32500000,
        normalizedValueJson: 32500000,
        confidence: 100,
        status: "pending",
        required: true,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });

    // A required field is still unreviewed, so commit stays blocked with guidance.
    expect(screen.getByRole("button", { name: /commit reviewed setup/i })).toBeDisabled();
    expect(screen.getByText(/still need a quick review/i)).toBeVisible();
  });

  it("explains an incomplete-review commit rejection in plain language", () => {
    mutateCommit.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error("review_incomplete"));
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveTextContent("review_incomplete");
    expect(alert).toHaveTextContent(/review/i);
  });

  it.each([
    ["missing_approved_funder_name", /funder name is missing/i],
    ["grant_funder_mismatch", /different funder/i],
  ])("maps the %s commit rejection to plain guidance", (code, pattern) => {
    mutateCommit.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new Error(code));
      },
    );
    render(<ExtractionReview extractionId="extraction-1" />);

    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveTextContent(code);
    expect(alert).toHaveTextContent(pattern);
  });

  it("uses fallback extracted field values for placeholders and commit basics", () => {
    extraction.fields = [
      {
        id: "field-name",
        fieldKey: "grant.name",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "name",
        valueJson: "Fallback Award",
        confidence: 85,
        status: "accepted",
        required: true,
      },
      {
        id: "field-amount",
        fieldKey: "grant.amountCents",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "amountCents",
        valueJson: 5000,
        normalizedValueJson: 5000,
        confidence: 85,
        status: "accepted",
        required: false,
      },
      {
        id: "field-start",
        fieldKey: "grant.startDate",
        section: "grant_basics",
        destinationEntityType: "grant",
        destinationField: "startDate",
        valueJson: "2026-02-03T00:00:00.000Z",
        normalizedValueJson: "2026-02-03T00:00:00.000Z",
        confidence: 85,
        status: "accepted",
        required: false,
      },
    ];

    render(<ExtractionReview extractionId="extraction-1" />);

    expect(screen.getByLabelText("Grant name")).toHaveAttribute("placeholder", "Fallback Award");
    // 5000 cents is shown to the reviewer as a dollar placeholder, never raw cents.
    expect(screen.getByLabelText("Award amount")).toHaveAttribute("placeholder", "50.00");
    expect(screen.getByLabelText("Grant start date")).toHaveAttribute("placeholder", "2026-02-03");
    fireEvent.change(screen.getByLabelText(/funder duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.change(screen.getByLabelText(/grant duplicate decision/i), {
      target: { value: "create_new" },
    });
    fireEvent.click(screen.getByRole("button", { name: /commit reviewed setup/i }));

    expect(mutateCommit).toHaveBeenCalledWith(
      {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Fallback Award",
          amountCents: 5000,
          startDate: "2026-02-03T00:00:00.000Z",
        },
      },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });
});
