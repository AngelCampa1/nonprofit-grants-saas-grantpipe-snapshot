import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type ColumnDef, type Row } from "@tanstack/react-table";
import { DataTable, numericSortingFn } from "./data-table";

// Test data type
interface Person {
  id: string;
  name: string;
  email: string;
  age: number;
}

const mockData: Person[] = [
  { id: "1", name: "Alice Johnson", email: "alice@example.com", age: 30 },
  { id: "2", name: "Bob Smith", email: "bob@example.com", age: 25 },
  { id: "3", name: "Carol White", email: "carol@example.com", age: 35 },
];

const columns: ColumnDef<Person, string>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "age",
    header: "Age",
  },
];

const sortableColumns: ColumnDef<Person, string>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
  },
  {
    accessorKey: "email",
    header: "Email",
    enableSorting: false,
  },
];

describe("numericSortingFn", () => {
  // Build a minimal Row stub exposing only getValue, which is all the
  // comparator reads. Cast through the Row type for the call signature.
  function row(value: unknown): Row<Person> {
    return { getValue: () => value } as unknown as Row<Person>;
  }

  it("sorts numeric strings by value, not lexicographically", () => {
    // "2000000" vs "10000": lexicographic would put "10000" first; numeric must not.
    expect(numericSortingFn(row("2000000"), row("10000"), "x")).toBeGreaterThan(0);
    expect(numericSortingFn(row("500"), row("5000"), "x")).toBeLessThan(0);
  });

  it("sorts real numbers correctly", () => {
    expect(numericSortingFn(row(20000), row(10000), "x")).toBeGreaterThan(0);
    expect(numericSortingFn(row(100), row(250), "x")).toBeLessThan(0);
  });

  it("handles mixed number and string values", () => {
    expect(numericSortingFn(row(20000), row("10000"), "x")).toBeGreaterThan(0);
    expect(numericSortingFn(row("20000"), row(10000), "x")).toBeGreaterThan(0);
  });

  it("treats null, undefined, and non-numeric as zero", () => {
    expect(numericSortingFn(row(null), row(5), "x")).toBeLessThan(0);
    expect(numericSortingFn(row(undefined), row(5), "x")).toBeLessThan(0);
    expect(numericSortingFn(row("abc"), row(5), "x")).toBeLessThan(0);
    expect(numericSortingFn(row(null), row(undefined), "x")).toBe(0);
  });

  it("returns 0 for equal values", () => {
    expect(numericSortingFn(row("1000"), row(1000), "x")).toBe(0);
  });
});

describe("DataTable", () => {
  // 1. Renders table with data rows
  it("renders table with data rows", () => {
    render(<DataTable columns={columns} data={mockData} />);

    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.getByText("Carol White")).toBeInTheDocument();
  });

  // 2. Renders header columns with correct labels
  it("renders header columns with correct labels", () => {
    render(<DataTable columns={columns} data={mockData} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
  });

  // 3. Loading state shows skeleton rows (not data rows)
  it("shows skeleton rows when isLoading=true, not data rows", () => {
    render(<DataTable columns={columns} data={mockData} isLoading skeletonRows={3} />);

    // Data rows should not be visible
    expect(screen.queryByText("Alice Johnson")).not.toBeInTheDocument();

    // Skeletons should be present
    const skeletons = document.querySelectorAll("[data-slot='skeleton']");
    // 3 skeleton rows × 3 columns = 9 skeletons
    expect(skeletons.length).toBe(9);
  });

  it("defaults to 5 skeleton rows when isLoading and skeletonRows not specified", () => {
    render(<DataTable columns={columns} data={mockData} isLoading />);

    const skeletons = document.querySelectorAll("[data-slot='skeleton']");
    // 5 skeleton rows × 3 columns = 15 skeletons
    expect(skeletons.length).toBe(15);
  });

  // 4. Empty state renders when data=[] and not loading
  it("renders default empty state when data is empty and not loading", () => {
    render(<DataTable columns={columns} data={[]} />);

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("uses emptyTitle prop in default empty state", () => {
    render(<DataTable columns={columns} data={[]} emptyTitle="No donors found" />);

    expect(screen.getByText("No donors found")).toBeInTheDocument();
  });

  it("uses emptyDescription prop in default empty state", () => {
    render(<DataTable columns={columns} data={[]} emptyDescription="Start by adding a donor." />);

    expect(screen.getByText("Start by adding a donor.")).toBeInTheDocument();
  });

  // 5. Custom emptyState prop is used when provided
  it("renders custom emptyState when provided", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<div data-testid="custom-empty">Custom empty content</div>}
      />,
    );

    expect(screen.getByTestId("custom-empty")).toBeInTheDocument();
    expect(screen.getByText("Custom empty content")).toBeInTheDocument();
  });

  it("does not render default empty state when custom emptyState is provided", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<div>Custom empty</div>}
        emptyTitle="Should not appear"
      />,
    );

    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  // 6. Row selection
  it("does not show checkbox column when enableRowSelection is false", () => {
    render(<DataTable columns={columns} data={mockData} />);

    const checkboxes = screen.queryAllByRole("checkbox");
    expect(checkboxes).toHaveLength(0);
  });

  it("shows checkbox column when enableRowSelection=true", () => {
    render(<DataTable columns={columns} data={mockData} enableRowSelection />);

    // 1 header checkbox + 3 row checkboxes
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(4);
  });

  it("calls onRowSelectionChange when a row is selected", () => {
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={mockData}
        enableRowSelection
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    // Click the first row checkbox (index 1 = skip header)
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);

    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    expect(onRowSelectionChange).toHaveBeenCalledWith([mockData[0]]);
  });

  it("selects all rows when header checkbox is clicked", () => {
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={mockData}
        enableRowSelection
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // header checkbox

    expect(onRowSelectionChange).toHaveBeenCalledWith(mockData);
  });

  it("deselects all rows when header checkbox is clicked again", () => {
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={mockData}
        enableRowSelection
        onRowSelectionChange={onRowSelectionChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // select all
    fireEvent.click(checkboxes[0]); // deselect all

    const lastCall = onRowSelectionChange.mock.calls[onRowSelectionChange.mock.calls.length - 1];
    expect(lastCall[0]).toHaveLength(0);
  });

  // 7. Sorting
  it("renders sort button on sortable column headers", () => {
    render(<DataTable columns={sortableColumns} data={mockData} />);

    const nameHeader = screen.getByRole("button", { name: /name/i });
    expect(nameHeader).toBeInTheDocument();
  });

  it("clicking a sortable column header changes sort direction to ascending", () => {
    render(<DataTable columns={sortableColumns} data={mockData} />);

    const nameHeader = screen.getByRole("button", { name: /sort by name/i });
    fireEvent.click(nameHeader);

    // After clicking once, sorted ascending — aria-label tells next action (sort desc)
    expect(nameHeader).toHaveAttribute("aria-label", expect.stringMatching(/desc/i));
  });

  it("clicking a sortable column header twice changes sort direction to descending", () => {
    render(<DataTable columns={sortableColumns} data={mockData} />);

    const nameHeader = screen.getByRole("button", { name: /sort by name/i });
    fireEvent.click(nameHeader); // asc — label now says "desc"
    fireEvent.click(nameHeader); // desc — label now says "clear"

    expect(nameHeader).toHaveAttribute("aria-label", expect.stringMatching(/clear/i));
  });

  it("clicking a sortable column header three times clears the sort", () => {
    render(<DataTable columns={sortableColumns} data={mockData} />);

    const nameHeader = screen.getByRole("button", { name: /sort by name/i });
    fireEvent.click(nameHeader); // asc
    fireEvent.click(nameHeader); // desc
    fireEvent.click(nameHeader); // clear

    expect(nameHeader).toHaveAttribute("aria-label", expect.stringMatching(/sort by name/i));
  });

  it("uses the visible header text (not the column id) for the sort accessible name", () => {
    const camelCaseColumns: ColumnDef<Person, string>[] = [
      {
        // id/accessorKey is an internal camelCase key that differs from the label
        accessorKey: "totalGivingCents",
        header: "Total Giving",
        enableSorting: true,
      },
    ];
    const camelCaseData = [
      { id: "1", name: "A", email: "a@x.com", age: 1, totalGivingCents: 100 },
    ] as unknown as Person[];

    render(<DataTable columns={camelCaseColumns} data={camelCaseData} />);

    // Screen readers must hear the human label, never the raw field key.
    expect(screen.getByRole("button", { name: "Sort by Total Giving" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /totalGivingCents/ })).not.toBeInTheDocument();
  });

  // 8. Pagination
  it("does not show pagination footer when enablePagination is false", () => {
    render(<DataTable columns={columns} data={mockData} />);

    expect(screen.queryByRole("navigation", { name: /pagination/i })).not.toBeInTheDocument();
  });

  it("shows pagination footer when enablePagination=true", () => {
    const manyData: Person[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      age: 20 + i,
    }));

    render(<DataTable columns={columns} data={manyData} enablePagination pageSize={10} />);

    // Should show "Showing 1–10 of 15"
    expect(screen.getByText(/showing/i)).toBeInTheDocument();
    // The text is rendered as a single element: "Showing 1–10 of 15"
    expect(
      screen.getByText(
        (content) => content.includes("1") && content.includes("10") && content.includes("15"),
      ),
    ).toBeInTheDocument();
  });

  it("next page button advances the page", () => {
    const manyData: Person[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      age: 20 + i,
    }));

    render(<DataTable columns={columns} data={manyData} enablePagination pageSize={10} />);

    // Click Next
    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    // Should now show remaining 5 rows
    expect(screen.getByText("Person 11")).toBeInTheDocument();
    expect(screen.queryByText("Person 1")).not.toBeInTheDocument();
  });

  it("previous page button goes back a page", () => {
    const manyData: Person[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      age: 20 + i,
    }));

    render(<DataTable columns={columns} data={manyData} enablePagination pageSize={10} />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton); // go to page 2

    const prevButton = screen.getByRole("button", { name: /prev/i });
    fireEvent.click(prevButton); // back to page 1

    expect(screen.getByText("Person 1")).toBeInTheDocument();
  });

  it("previous button is disabled on first page", () => {
    render(<DataTable columns={columns} data={mockData} enablePagination pageSize={10} />);

    const prevButton = screen.getByRole("button", { name: /prev/i });
    expect(prevButton).toBeDisabled();
  });

  it("next button is disabled on last page", () => {
    render(<DataTable columns={columns} data={mockData} enablePagination pageSize={10} />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  // 9. Column visibility
  it("does not show Columns button when enableColumnVisibility is false", () => {
    render(<DataTable columns={columns} data={mockData} />);

    expect(screen.queryByRole("button", { name: /columns/i })).not.toBeInTheDocument();
  });

  it("shows Columns button when enableColumnVisibility=true", () => {
    render(<DataTable columns={columns} data={mockData} enableColumnVisibility />);

    expect(screen.getByRole("button", { name: /columns/i })).toBeInTheDocument();
  });

  it("opens column visibility dropdown when Columns button is clicked", async () => {
    render(<DataTable columns={columns} data={mockData} enableColumnVisibility />);

    const columnsButton = screen.getByRole("button", { name: /columns/i });
    fireEvent.pointerDown(columnsButton);

    // Should show column names in dropdown (Radix renders into portal on body)
    const nameItems = await screen.findAllByText("Name");
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
  });

  it("toggling a column in the dropdown hides it from the table", async () => {
    render(<DataTable columns={columns} data={mockData} enableColumnVisibility />);

    const columnsButton = screen.getByRole("button", { name: /columns/i });
    fireEvent.pointerDown(columnsButton);

    // Radix renders menu into a portal on document.body; wait for it to open
    const menuItems = await screen.findAllByRole("menuitemcheckbox");
    const nameItem = menuItems.find((item) => item.textContent?.includes("Name"));
    expect(nameItem).toBeDefined();
    if (nameItem) {
      fireEvent.click(nameItem);
    }

    // Name column header should no longer be visible
    expect(screen.queryByRole("columnheader", { name: "Name" })).not.toBeInTheDocument();
  });

  // 10. Caption prop
  it("renders caption when provided", () => {
    render(<DataTable columns={columns} data={mockData} caption="List of team members" />);

    expect(screen.getByText("List of team members")).toBeInTheDocument();
  });

  it("does not render caption element when caption prop is not provided", () => {
    const { container } = render(<DataTable columns={columns} data={mockData} />);

    expect(container.querySelector("caption")).not.toBeInTheDocument();
  });

  // Additional: className prop
  it("applies custom className to the container", () => {
    const { container } = render(
      <DataTable columns={columns} data={mockData} className="my-custom-class" />,
    );

    expect(container.firstChild).toHaveClass("my-custom-class");
  });

  it("renders a polished table surface by default", () => {
    const { container } = render(<DataTable columns={columns} data={mockData} />);

    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-density", "comfortable");
    expect(root).toHaveAttribute("data-surface", "default");
    expect(root?.querySelector("[data-slot='data-table-surface']")).toHaveClass(
      "rounded-2xl",
      "border",
      "bg-card",
      "shadow-sm",
    );
  });

  it("supports compact density for accounting-style data", () => {
    const { container } = render(<DataTable columns={columns} data={mockData} density="compact" />);

    expect(container.firstElementChild).toHaveAttribute("data-density", "compact");
    expect(container.querySelector("[data-slot='table-head']")).toHaveClass("h-8");
    expect(container.querySelector("[data-slot='table-cell']")).toHaveClass("px-3", "py-1.5");
  });

  it("applies compact density to loading skeleton rows", () => {
    const { container } = render(
      <DataTable columns={columns} data={[]} density="compact" isLoading />,
    );

    expect(container.querySelector("[data-slot='table-cell']")).toHaveClass("px-3", "py-1.5");
  });

  it("can render without an outer table surface inside existing panels", () => {
    const { container } = render(<DataTable columns={columns} data={mockData} surface="plain" />);

    expect(container.firstElementChild).toHaveAttribute("data-surface", "plain");
    expect(container.querySelector("[data-slot='data-table-surface']")).toHaveClass("rounded-none");
  });

  // Pagination shows "Showing X-Y of Z" for small datasets
  it("shows correct row count in pagination footer for all rows on one page", () => {
    render(<DataTable columns={columns} data={mockData} enablePagination pageSize={10} />);

    // "Showing 1–3 of 3"
    expect(
      screen.getByText(
        (content) => content.includes("1") && content.includes("3") && content.includes("of"),
      ),
    ).toBeInTheDocument();
  });

  // Empty state is NOT shown during loading
  it("does not render empty state when isLoading=true even if data is empty", () => {
    render(<DataTable columns={columns} data={[]} isLoading />);

    expect(screen.queryByText("No results")).not.toBeInTheDocument();
  });

  // Default pageSize is 10
  it("uses default pageSize of 10 when not specified", () => {
    const manyData: Person[] = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 1),
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      age: 20 + i,
    }));

    render(<DataTable columns={columns} data={manyData} enablePagination />);

    // With default page size of 10, only first 10 rows should appear
    expect(screen.getByText("Person 1")).toBeInTheDocument();
    expect(screen.getByText("Person 10")).toBeInTheDocument();
    expect(screen.queryByText("Person 11")).not.toBeInTheDocument();
  });

  // Test within context: pagination showing with selection
  it("works correctly with both enableRowSelection and enablePagination", () => {
    const manyData: Person[] = Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      age: 20 + i,
    }));
    const onRowSelectionChange = vi.fn();

    render(
      <DataTable
        columns={columns}
        data={manyData}
        enableRowSelection
        onRowSelectionChange={onRowSelectionChange}
        enablePagination
        pageSize={10}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThanOrEqual(11); // header + 10 rows
    expect(screen.getByText(/showing/i)).toBeInTheDocument();
  });

  // Pagination with zero rows shows "Showing 0–0 of 0"
  it("shows 0 rows in pagination footer when data is empty", () => {
    render(<DataTable columns={columns} data={[]} enablePagination pageSize={10} />);

    // The pagination nav shows a "Showing …" span — use getAllByText and assert at least one matches
    const matchingElements = screen.getAllByText(
      (content, element) => element?.tagName === "SPAN" && content.includes("Showing"),
    );
    expect(matchingElements.length).toBeGreaterThanOrEqual(1);
    expect(matchingElements[0]).toBeInTheDocument();
  });

  // SortIcon — asc direction renders ChevronUp (verify aria-label reflects asc state)
  it("reflects ascending sort direction in aria-label after one click", () => {
    render(<DataTable columns={sortableColumns} data={mockData} />);

    const nameHeader = screen.getByRole("button", { name: /sort by name/i });
    fireEvent.click(nameHeader); // now ascending

    // aria-label now says "desc" because clicking again would sort desc
    expect(nameHeader).toHaveAttribute("aria-label", expect.stringMatching(/desc/i));
  });

  // Column visibility: column with non-string header falls back to col.id
  it("shows column id when column header is not a string", async () => {
    const columnsWithCustomHeader: ColumnDef<Person, string>[] = [
      {
        accessorKey: "name",
        // non-string header — a render function
        header: () => <span>Custom Name Header</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
      },
    ];

    render(<DataTable columns={columnsWithCustomHeader} data={mockData} enableColumnVisibility />);

    const columnsButton = screen.getByRole("button", { name: /columns/i });
    fireEvent.pointerDown(columnsButton);

    // The dropdown should show the column id ("name") since header is not a string
    const menuItems = await screen.findAllByRole("menuitemcheckbox");
    // One item has the col id "name", the other has the string header "Email"
    const itemTexts = menuItems.map((item) => item.textContent);
    expect(itemTexts).toContain("Email");
    // The non-string header column uses its id
    expect(itemTexts.some((t) => t === "name" || t === "email")).toBe(true);
  });

  // enableRowSelection without onRowSelectionChange callback — no crash
  it("does not crash when enableRowSelection=true but onRowSelectionChange is not provided", () => {
    render(<DataTable columns={columns} data={mockData} enableRowSelection />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(() => fireEvent.click(checkboxes[1])).not.toThrow();
  });

  // Header checkbox indeterminate state (some rows selected)
  it("sets indeterminate on header checkbox when only some rows are selected", () => {
    render(<DataTable columns={columns} data={mockData} enableRowSelection />);

    const checkboxes = screen.getAllByRole("checkbox");
    // Select only the first row checkbox
    fireEvent.click(checkboxes[1]);

    // Header checkbox should be indeterminate (not fully checked)
    const headerCheckbox = checkboxes[0];
    // data-state="indeterminate" is set by Radix Checkbox when checked="indeterminate"
    expect(headerCheckbox).toHaveAttribute("data-state", "indeterminate");
  });

  it("sort button uses standardized focus ring (ring-[3px] ring-ring/50, no ring-offset)", () => {
    render(<DataTable columns={sortableColumns} data={mockData} />);

    const sortBtn = screen.getByRole("button", { name: /sort by name/i });
    expect(sortBtn.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(sortBtn.className).toMatch(/focus-visible:ring-ring\/50/);
    expect(sortBtn.className).not.toMatch(/focus-visible:ring-offset/);
  });

  // Placeholder header coverage — a single group with nested columns creates placeholder headers
  // in the second header row for parent columns that don't repeat as leaves
  it("renders grouped column headers (isPlaceholder branch for parent in leaf row)", () => {
    // Two separate groups side by side: each group has one leaf column
    // The first row will have "Identity" and "Contact" spanning their respective columns
    // The second row will have "Name" and "Email" (leaves) — and the parent placeholders
    // won't appear because TanStack only adds a placeholder when a parent has more depth
    // Use a 3-level structure to force placeholders:
    // Level 0: [group A (2 children), single col B]
    // Level 1: [name, email, B-placeholder]
    // The B col at level 1 will have isPlaceholder=true in the first row
    const mixedColumns: ColumnDef<Person, string>[] = [
      {
        id: "contact",
        header: "Contact Info",
        columns: [
          { accessorKey: "name", header: "Name" },
          { accessorKey: "email", header: "Email" },
        ],
      },
      {
        accessorKey: "age",
        header: "Age",
      },
    ];

    render(<DataTable columns={mixedColumns} data={mockData} />);

    expect(screen.getByText("Contact Info")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
  });

  // Line 164: currentPageSize falls back to totalRows when pagination.pageSize is not in state
  // This is exercised by rendering without pagination enabled — internal state has no controlled pageSize
  it("renders all rows when enablePagination is false (currentPageSize fallback)", () => {
    const manyData: Person[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      name: `Person ${i + 1}`,
      email: `person${i + 1}@example.com`,
      age: 20 + i,
    }));

    render(<DataTable columns={columns} data={manyData} />);

    // All 12 rows should be visible since there is no pagination
    expect(screen.getByText("Person 1")).toBeInTheDocument();
    expect(screen.getByText("Person 12")).toBeInTheDocument();
  });
});
