import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";

describe("Breadcrumb", () => {
  it("renders a nav with aria-label", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeInTheDocument();
  });

  it("renders data-slot attributes on all subcomponents", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Current Page</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(container.querySelector('[data-slot="breadcrumb"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="breadcrumb-list"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="breadcrumb-item"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="breadcrumb-link"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="breadcrumb-separator"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="breadcrumb-page"]')).toBeInTheDocument();
  });

  it("renders BreadcrumbList as an ordered list", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(container.querySelector("ol")).toBeInTheDocument();
  });

  it("renders BreadcrumbLink as an anchor tag", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/grants">Grants</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const link = screen.getByRole("link", { name: "Grants" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/grants");
  });

  it("renders BreadcrumbPage as a span with aria-current=page", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Grant Detail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const page = container.querySelector('[aria-current="page"]');
    expect(page).toBeInTheDocument();
    expect(page?.tagName).toBe("SPAN");
    expect(page).toHaveTextContent("Grant Detail");
  });

  it("renders BreadcrumbSeparator with default chevron content", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const sep = container.querySelector('[data-slot="breadcrumb-separator"]');
    expect(sep).toBeInTheDocument();
    // aria-hidden separator
    expect(sep).toHaveAttribute("aria-hidden", "true");
  });

  it("renders BreadcrumbSeparator with custom children", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbSeparator>/</BreadcrumbSeparator>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(screen.getByText("/")).toBeInTheDocument();
  });

  it("renders BreadcrumbEllipsis with correct data-slot and aria-hidden", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const ellipsis = container.querySelector('[data-slot="breadcrumb-ellipsis"]');
    expect(ellipsis).toBeInTheDocument();
    expect(ellipsis).toHaveAttribute("aria-hidden", "true");
  });

  it("merges custom className on Breadcrumb", () => {
    const { container } = render(
      <Breadcrumb className="custom-nav">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(container.querySelector("nav")).toHaveClass("custom-nav");
  });

  it("merges custom className on BreadcrumbList", () => {
    const { container } = render(
      <Breadcrumb>
        <BreadcrumbList className="custom-list">
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(container.querySelector("ol")).toHaveClass("custom-list");
  });

  it("merges custom className on BreadcrumbLink", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/" className="custom-link">
              Home
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("custom-link");
  });

  it("renders BreadcrumbLink with asChild rendering a different element", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <button type="button">Home</button>
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    const btn = screen.getByRole("button", { name: "Home" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("data-slot", "breadcrumb-link");
  });

  it("renders a full multi-level breadcrumb correctly", () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/grants">Grants</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>NSF Grant Detail</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    );

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grants" })).toBeInTheDocument();
    expect(screen.getByText("NSF Grant Detail")).toBeInTheDocument();
  });
});
