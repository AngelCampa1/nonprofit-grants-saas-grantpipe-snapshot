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
  cardVariants,
} from "./card";

describe("Card", () => {
  it("renders as a div with data-slot='card'", () => {
    const { container } = render(<Card>content</Card>);
    const el = container.querySelector("[data-slot='card']");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("DIV");
  });

  it("merges additional className with defaults", () => {
    const { container } = render(<Card className="custom-x">x</Card>);
    const el = container.querySelector("[data-slot='card']");
    expect(el).toHaveClass("custom-x");
    expect(el).toHaveClass("rounded-2xl");
  });

  it("forwards arbitrary attributes", () => {
    const { container } = render(<Card data-testid="card-root">x</Card>);
    expect(container.querySelector("[data-testid='card-root']")).not.toBeNull();
  });

  it("renders the exact unchanged default class string (no interactive/hover classes)", () => {
    const { container } = render(<Card>content</Card>);
    const el = container.querySelector("[data-slot='card']");
    expect(el).toHaveClass(
      "flex",
      "flex-col",
      "gap-6",
      "rounded-2xl",
      "border",
      "bg-card",
      "py-6",
      "text-card-foreground",
      "shadow-sm",
    );
    expect(el).not.toHaveClass("cursor-pointer");
    expect(el).not.toHaveClass("hover:shadow-md");
  });
});

describe("CardHeader", () => {
  it("renders as a div with data-slot='card-header'", () => {
    const { container } = render(<CardHeader>h</CardHeader>);
    const el = container.querySelector("[data-slot='card-header']");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("DIV");
  });

  it("merges custom className", () => {
    const { container } = render(<CardHeader className="extra">h</CardHeader>);
    expect(container.querySelector("[data-slot='card-header']")).toHaveClass("extra");
  });
});

describe("CardTitle", () => {
  it("defaults to <h3> for semantic heading hierarchy", () => {
    render(<CardTitle>Title text</CardTitle>);
    const heading = screen.getByRole("heading", { level: 3, name: "Title text" });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe("H3");
    expect(heading).toHaveAttribute("data-slot", "card-title");
  });

  it("renders a different heading level via the `as` prop", () => {
    render(<CardTitle as="h2">Bigger title</CardTitle>);
    const heading = screen.getByRole("heading", { level: 2, name: "Bigger title" });
    expect(heading.tagName).toBe("H2");
  });

  it("supports all heading levels", () => {
    const levels = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
    for (const level of levels) {
      const { unmount } = render(<CardTitle as={level}>{level}</CardTitle>);
      expect(screen.getByText(level).tagName).toBe(level.toUpperCase());
      unmount();
    }
  });

  it("merges custom className with default font-semibold styling", () => {
    render(<CardTitle className="text-xl">x</CardTitle>);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading).toHaveClass("text-xl");
    expect(heading).toHaveClass("font-semibold");
  });
});

describe("CardDescription", () => {
  it("renders as a div with data-slot='card-description'", () => {
    const { container } = render(<CardDescription>desc</CardDescription>);
    const el = container.querySelector("[data-slot='card-description']");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("DIV");
  });

  it("applies muted text styling", () => {
    const { container } = render(<CardDescription>d</CardDescription>);
    expect(container.querySelector("[data-slot='card-description']")).toHaveClass(
      "text-muted-foreground",
    );
  });
});

describe("CardAction", () => {
  it("renders as a div with data-slot='card-action'", () => {
    const { container } = render(<CardAction>action</CardAction>);
    const el = container.querySelector("[data-slot='card-action']");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("DIV");
  });

  it("uses grid column positioning classes", () => {
    const { container } = render(<CardAction>a</CardAction>);
    expect(container.querySelector("[data-slot='card-action']")).toHaveClass("col-start-2");
  });
});

describe("CardContent", () => {
  it("renders as a div with data-slot='card-content' and horizontal padding", () => {
    const { container } = render(<CardContent>c</CardContent>);
    const el = container.querySelector("[data-slot='card-content']");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("DIV");
    expect(el).toHaveClass("px-6");
  });

  it("merges custom className", () => {
    const { container } = render(<CardContent className="bg-red-50">c</CardContent>);
    expect(container.querySelector("[data-slot='card-content']")).toHaveClass("bg-red-50");
  });
});

describe("CardFooter", () => {
  it("renders as a div with data-slot='card-footer'", () => {
    const { container } = render(<CardFooter>f</CardFooter>);
    const el = container.querySelector("[data-slot='card-footer']");
    expect(el).not.toBeNull();
    expect(el?.tagName).toBe("DIV");
  });

  it("centers items horizontally", () => {
    const { container } = render(<CardFooter>f</CardFooter>);
    expect(container.querySelector("[data-slot='card-footer']")).toHaveClass("items-center");
  });
});

describe("cardVariants", () => {
  it("interactive variant contains cursor and hover/focus affordance classes", () => {
    const classes = cardVariants({ variant: "interactive" });
    expect(classes).toContain("cursor-pointer");
    expect(classes).toContain("hover:shadow-md");
    expect(classes).toContain("hover:border-primary/30");
    expect(classes).toContain("focus-visible:ring-[3px]");
    expect(classes).toContain("focus-visible:ring-ring/50");
  });

  it("interactive variant keeps card geometry classes", () => {
    const classes = cardVariants({ variant: "interactive" });
    expect(classes).toContain("rounded-2xl");
    expect(classes).toContain("border-border");
    expect(classes).toContain("bg-card");
  });

  it("interactive variant has a resting border width and shadow", () => {
    const tokens = cardVariants({ variant: "interactive" }).split(/\s+/);
    expect(tokens).toContain("border");
    expect(tokens).toContain("shadow-sm");
  });

  it("static variant (default) contains no hover/interactive classes", () => {
    const classes = cardVariants();
    expect(classes).not.toContain("cursor-pointer");
    expect(classes).not.toContain("hover:shadow-md");
    expect(classes).not.toContain("hover:border-primary/30");
  });

  it("static variant reproduces the current Card class string exactly", () => {
    const staticClasses = cardVariants({ variant: "static" });
    expect(staticClasses).toBe(
      "flex flex-col gap-6 rounded-2xl border bg-card py-6 text-card-foreground shadow-sm",
    );
  });
});

describe("Card composition", () => {
  it("renders a full card with all subcomponents", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
          <CardAction>Act</CardAction>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByText("Act")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Foot")).toBeInTheDocument();
  });
});
