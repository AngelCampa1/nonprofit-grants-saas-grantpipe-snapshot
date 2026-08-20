import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

describe("Table", () => {
  it("supports sticky first columns through data attributes", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-sticky="first">Name</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell data-sticky="first">Long Foundation Name</TableCell>
            <TableCell>$10,000.00</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("Name")).toHaveClass("sticky", "left-0", "z-20");
    expect(screen.getByText("Long Foundation Name")).toHaveClass("sticky", "left-0", "z-10");
  });

  it("supports numeric and truncated cells for dense financial data", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell data-truncate title="A memo that may be very long">
              A memo that may be very long
            </TableCell>
            <TableCell data-align="numeric">$123,456.78</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("A memo that may be very long")).toHaveClass("max-w-xs", "truncate");
    expect(screen.getByText("$123,456.78")).toHaveClass("text-right", "font-mono", "tabular-nums");
  });

  it("supports numeric and truncated header cells", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-truncate>Very long memo heading</TableHead>
            <TableHead data-align="numeric">Amount</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );

    expect(screen.getByText("Very long memo heading")).toHaveClass("max-w-xs", "truncate");
    expect(screen.getByText("Amount")).toHaveClass("text-right", "font-mono", "tabular-nums");
  });

  it("uses rounded-2xl container radius", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(container.querySelector("[data-slot='table-container']")).toHaveClass("rounded-2xl");
  });

  it("does not apply dense helpers when data attributes are absent or false", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead data-sticky={undefined} data-truncate={false}>
              Plain heading
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell data-sticky={undefined} data-truncate={false}>
              Plain cell
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByText("Plain heading")).not.toHaveClass("sticky", "truncate");
    expect(screen.getByText("Plain cell")).not.toHaveClass("sticky", "truncate");
  });
});
