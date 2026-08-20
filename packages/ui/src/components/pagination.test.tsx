import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "./pagination";

describe("Pagination", () => {
  it("renders a nav element with aria-label", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole("navigation", { name: "pagination" })).toBeInTheDocument();
  });

  it("renders data-slot attributes on all subcomponents", () => {
    const { container } = render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(container.querySelector('[data-slot="pagination"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="pagination-content"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="pagination-item"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="pagination-link"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="pagination-previous"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="pagination-ellipsis"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="pagination-next"]')).toBeInTheDocument();
  });

  it("renders PaginationContent as a ul", () => {
    const { container } = render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(container.querySelector("ul")).toBeInTheDocument();
  });

  it("renders PaginationItem as a li", () => {
    const { container } = render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(container.querySelector("li")).toBeInTheDocument();
  });

  it("renders PaginationLink as an anchor", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="/page/2">2</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const link = screen.getByRole("link", { name: "2" });
    expect(link).toHaveAttribute("href", "/page/2");
  });

  it("applies aria-current=page on active PaginationLink", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              3
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const link = screen.getByRole("link", { name: "3" });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("does not set aria-current when PaginationLink is not active", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const link = screen.getByRole("link", { name: "1" });
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("renders PaginationPrevious with accessible label", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="/page/1" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole("link", { name: /previous/i })).toBeInTheDocument();
  });

  it("renders PaginationNext with accessible label", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="/page/3" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole("link", { name: /next/i })).toBeInTheDocument();
  });

  it("renders disabled PaginationPrevious with aria-disabled", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" disabled />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const link = screen.getByRole("link", { name: /previous/i });
    expect(link).toHaveAttribute("aria-disabled", "true");
  });

  it("renders disabled PaginationNext with aria-disabled", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="#" disabled />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const link = screen.getByRole("link", { name: /next/i });
    expect(link).toHaveAttribute("aria-disabled", "true");
  });

  it("renders PaginationEllipsis with aria-hidden", () => {
    const { container } = render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    const ellipsis = container.querySelector('[data-slot="pagination-ellipsis"]');
    expect(ellipsis).toHaveAttribute("aria-hidden", "true");
  });

  it("merges custom className on Pagination", () => {
    const { container } = render(
      <Pagination className="custom-pagination">
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(container.querySelector("nav")).toHaveClass("custom-pagination");
  });

  it("merges custom className on PaginationLink", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" className="custom-link">
              1
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole("link", { name: "1" })).toHaveClass("custom-link");
  });

  it("PaginationLink is pill-shaped (rounded-full)", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    expect(screen.getByRole("link", { name: "1" })).toHaveClass("rounded-full");
  });

  it("PaginationPrevious and PaginationNext are pill-shaped (rounded-full)", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    expect(screen.getByRole("link", { name: /previous/i })).toHaveClass("rounded-full");
    expect(screen.getByRole("link", { name: /next/i })).toHaveClass("rounded-full");
  });
});
