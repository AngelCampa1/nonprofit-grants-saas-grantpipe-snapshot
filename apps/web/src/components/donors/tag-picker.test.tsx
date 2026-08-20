import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TagPicker } from "./tag-picker";

const mockUseTags = vi.fn();
const mockUseCreateTag = vi.fn();

vi.mock("../../hooks/use-donors", () => ({
  useTags: () => mockUseTags(),
  useCreateTag: () => mockUseCreateTag(),
}));

const sampleTags = [
  { id: "tag-1", name: "Major Donor", color: "#e07a5f" },
  { id: "tag-2", name: "Volunteer", color: "#3d405b" },
  { id: "tag-3", name: "Board Member", color: "#81b29a" },
];

describe("TagPicker", () => {
  const mockOnToggle = vi.fn();
  const mockOnCreateTag = vi.fn();

  beforeEach(() => {
    mockOnToggle.mockClear();
    mockOnCreateTag.mockClear();
    mockOnCreateTag.mockResolvedValue(undefined);
    mockUseTags.mockReturnValue({ data: sampleTags, isLoading: false });
  });

  it("renders the tag picker trigger button", () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    expect(screen.getByRole("button", { name: /tags/i })).toBeInTheDocument();
  });

  it("opens popover and shows existing tags when trigger is clicked", async () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => {
      expect(screen.getByText("Major Donor")).toBeInTheDocument();
      expect(screen.getByText("Volunteer")).toBeInTheDocument();
      expect(screen.getByText("Board Member")).toBeInTheDocument();
    });
  });

  it("calls onToggle when a tag item is clicked", async () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByText("Major Donor"));
    fireEvent.click(screen.getByText("Major Donor"));
    expect(mockOnToggle).toHaveBeenCalledWith("tag-1");
  });

  it("has a create new tag input visible after opening", async () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/new tag name/i)).toBeInTheDocument();
    });
  });

  it("calls onCreateTag when enter is pressed in the create input", async () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByPlaceholderText(/new tag name/i));
    const input = screen.getByPlaceholderText(/new tag name/i);
    fireEvent.change(input, { target: { value: "Legacy Donor" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    await waitFor(() => {
      expect(mockOnCreateTag).toHaveBeenCalledWith("Legacy Donor", undefined);
      expect(input).toHaveValue("");
    });
  });

  it("shows empty state when no tags exist", async () => {
    mockUseTags.mockReturnValue({ data: [], isLoading: false });
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => {
      expect(screen.getByText(/no tags yet/i)).toBeInTheDocument();
    });
  });

  it("shows loading text when tags are loading", () => {
    mockUseTags.mockReturnValue({ data: undefined, isLoading: true });
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    expect(screen.getByRole("button", { name: /tags/i })).toBeInTheDocument();
  });

  it("renders selected tag count in the trigger", () => {
    render(
      <TagPicker
        selectedTagIds={["tag-1", "tag-2"]}
        onToggle={mockOnToggle}
        onCreateTag={mockOnCreateTag}
      />,
    );
    // The trigger should indicate selection count
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("does not call onCreateTag when create input is empty and Enter is pressed", async () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByPlaceholderText(/new tag name/i));
    const input = screen.getByPlaceholderText(/new tag name/i);
    // Press Enter with empty value (do not change the input)
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(mockOnCreateTag).not.toHaveBeenCalled();
  });

  it("renders tags without color correctly", async () => {
    mockUseTags.mockReturnValue({
      data: [{ id: "tag-4", name: "No Color Tag", color: null }],
      isLoading: false,
    });
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => {
      expect(screen.getByText("No Color Tag")).toBeInTheDocument();
    });
  });

  it("shows creating feedback and disables add while a tag is being created", async () => {
    render(
      <TagPicker
        selectedTagIds={[]}
        onToggle={mockOnToggle}
        onCreateTag={mockOnCreateTag}
        isCreatingTag
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByPlaceholderText(/new tag name/i));
    fireEvent.change(screen.getByPlaceholderText(/new tag name/i), {
      target: { value: "Stewardship" },
    });

    expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled();
  });

  it("calls onCreateTag when Add button is clicked with a non-empty input", async () => {
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByPlaceholderText(/new tag name/i));

    const input = screen.getByPlaceholderText(/new tag name/i);
    fireEvent.change(input, { target: { value: "Major Donor" } });

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(mockOnCreateTag).toHaveBeenCalledWith("Major Donor", undefined);
    });
  });

  it("guards against a double-click re-firing tag creation while the request is in flight", async () => {
    let resolveCreate: (() => void) | undefined;
    mockOnCreateTag.mockImplementation(
      () => new Promise<void>((resolve) => (resolveCreate = resolve)),
    );
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByPlaceholderText(/new tag name/i));
    fireEvent.change(screen.getByPlaceholderText(/new tag name/i), {
      target: { value: "Stewardship" },
    });
    const addButton = screen.getByRole("button", { name: /^add$/i });
    fireEvent.click(addButton);
    await waitFor(() => expect(screen.getByRole("button", { name: /adding/i })).toBeDisabled());
    // A second click while the first create is still pending must not re-fire.
    fireEvent.click(screen.getByRole("button", { name: /adding/i }));
    expect(mockOnCreateTag).toHaveBeenCalledTimes(1);
    resolveCreate!();
    await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument());
  });

  it("shows Loading tags text when tags are loading", async () => {
    mockUseTags.mockReturnValue({ data: undefined, isLoading: true });
    render(<TagPicker selectedTagIds={[]} onToggle={mockOnToggle} onCreateTag={mockOnCreateTag} />);
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => {
      expect(screen.getByText(/loading tags/i)).toBeInTheDocument();
    });
  });

  it("renders selected tags with checkmark icon", async () => {
    render(
      <TagPicker
        selectedTagIds={["tag-1"]}
        onToggle={mockOnToggle}
        onCreateTag={mockOnCreateTag}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /tags/i }));
    await waitFor(() => screen.getByText("Major Donor"));

    const majorDonorItem = screen.getByText("Major Donor").closest("[role='option']");
    expect(majorDonorItem).toHaveAttribute("aria-selected", "true");
  });
});
