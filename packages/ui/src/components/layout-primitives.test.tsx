import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

describe("layout primitives", () => {
  it("renders card sections with the expected slots", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Grant summary</CardTitle>
          <CardDescription>Quarterly snapshot</CardDescription>
          <CardAction>Action</CardAction>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByText("Grant summary").parentElement).toHaveAttribute(
      "data-slot",
      "card-header",
    );
    expect(screen.getByText("Grant summary")).toHaveAttribute("data-slot", "card-title");
    expect(screen.getByText("Quarterly snapshot")).toHaveAttribute("data-slot", "card-description");
    expect(screen.getByText("Action")).toHaveAttribute("data-slot", "card-action");
    expect(screen.getByText("Body")).toHaveAttribute("data-slot", "card-content");
    expect(screen.getByText("Footer")).toHaveAttribute("data-slot", "card-footer");
  });

  it("Card has large container rounding (rounded-2xl)", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.querySelector("[data-slot='card']")).toHaveClass("rounded-2xl");
  });

  it("renders table sections and cells with the expected slots", () => {
    render(
      <Table>
        <TableCaption>Recent grants</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell>Community fund</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(screen.getByText("Recent grants")).toHaveAttribute("data-slot", "table-caption");
    expect(screen.getByText("Title").closest("th")).toHaveAttribute("data-slot", "table-head");
    expect(screen.getByText("Community fund").closest("td")).toHaveAttribute(
      "data-slot",
      "table-cell",
    );
    expect(screen.getByText("Community fund").closest("tr")).toHaveAttribute(
      "data-slot",
      "table-row",
    );
    expect(screen.getByText("Total").closest("tfoot")).toHaveAttribute("data-slot", "table-footer");
  });
});
