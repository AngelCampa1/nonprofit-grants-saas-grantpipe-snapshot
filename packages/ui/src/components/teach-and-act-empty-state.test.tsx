import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TeachAndActEmptyState } from "./teach-and-act-empty-state";
import { EmptyStateLinkProvider } from "./empty-state-link-context";
import type { EmptyStateLinkProps } from "./empty-state-link-context";

const baseProps = {
  icon: <span data-testid="section-icon">icon</span>,
  heading: "Your grants live here",
  description:
    "Track every grant from application to close-out. All deadlines and compliance requirements in one place.",
  primaryAction: {
    label: "Add grant",
    onClick: vi.fn(),
  },
};

describe("TeachAndActEmptyState", () => {
  it("renders the icon", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    expect(screen.getByTestId("section-icon")).toBeInTheDocument();
  });

  it("renders the heading", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    expect(screen.getByRole("heading", { name: "Your grants live here" })).toBeInTheDocument();
  });

  it("renders the description", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    expect(
      screen.getByText(
        "Track every grant from application to close-out. All deadlines and compliance requirements in one place.",
      ),
    ).toBeInTheDocument();
  });

  it("renders without a description", () => {
    const { container } = render(<TeachAndActEmptyState {...baseProps} description={undefined} />);

    expect(screen.getByRole("region", { name: "Your grants live here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
    expect(
      container.querySelector("[data-slot='teach-and-act-empty-state-description']"),
    ).not.toBeInTheDocument();
  });

  it("renders primary button with label", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
  });

  it("renders without a primary action for read-only viewers", () => {
    render(<TeachAndActEmptyState {...baseProps} primaryAction={undefined} />);
    expect(screen.getByRole("region", { name: "Your grants live here" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders secondary action and help link without a primary action", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        primaryAction={undefined}
        secondaryAction={{ label: "Import CSV", onClick: vi.fn() }}
        helpLink={{ label: "View docs", href: "/docs" }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add grant" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import CSV" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View docs" })).toBeInTheDocument();
  });

  it("calls primaryAction.onClick when primary button is clicked", () => {
    const onClick = vi.fn();
    render(
      <TeachAndActEmptyState {...baseProps} primaryAction={{ label: "Add grant", onClick }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add grant" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders primary action as anchor when href is provided", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        primaryAction={{ label: "Go to grants", href: "/grants/new" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Go to grants" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/grants/new");
  });

  it("does not render secondary action when not provided", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders secondary action button with onClick when provided", () => {
    const onSecondaryClick = vi.fn();
    render(
      <TeachAndActEmptyState
        {...baseProps}
        secondaryAction={{ label: "Import CSV", onClick: onSecondaryClick }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Import CSV" });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSecondaryClick).toHaveBeenCalledOnce();
  });

  it("renders secondary action as anchor when href is provided", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        secondaryAction={{ label: "Learn more", href: "/docs/grants" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/docs/grants");
  });

  it("does not render help link when not provided", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders help link with correct href and label when provided", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        helpLink={{ label: "How grants work", href: "https://docs.grantpipe.com/grants" }}
      />,
    );
    const link = screen.getByRole("link", { name: "How grants work" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://docs.grantpipe.com/grants");
  });

  it("renders help link alongside action buttons", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        secondaryAction={{ label: "Import", onClick: vi.fn() }}
        helpLink={{ label: "View docs", href: "/docs" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Add grant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View docs" })).toBeInTheDocument();
  });

  it("wraps icon in a muted background container", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    const iconWrapper = screen.getByTestId("teach-act-icon-wrapper");
    expect(iconWrapper).toBeInTheDocument();
    expect(iconWrapper).toHaveClass("rounded-lg");
    expect(iconWrapper).toHaveClass("bg-muted");
  });

  it("primary button has default variant", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    const btn = screen.getByRole("button", { name: "Add grant" });
    expect(btn).toHaveAttribute("data-variant", "default");
  });

  it("secondary button has outline variant", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        secondaryAction={{ label: "Cancel", onClick: vi.fn() }}
      />,
    );
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn).toHaveAttribute("data-variant", "outline");
  });

  // Fix 1: role and aria-label on root element
  it("root element has role=region and aria-label matching heading", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    const region = screen.getByRole("region", { name: "Your grants live here" });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("aria-label", "Your grants live here");
  });

  // Fix 2: data-slot attributes on sub-elements
  it("icon wrapper has correct data-slot attribute", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    const iconWrapper = screen.getByTestId("teach-act-icon-wrapper");
    expect(iconWrapper).toHaveAttribute("data-slot", "teach-and-act-empty-state-icon");
  });

  it("heading has correct data-slot attribute", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    const heading = screen.getByRole("heading", { name: "Your grants live here" });
    expect(heading).toHaveAttribute("data-slot", "teach-and-act-empty-state-heading");
  });

  it("description has correct data-slot attribute", () => {
    render(<TeachAndActEmptyState {...baseProps} />);
    const description = screen.getByText(
      "Track every grant from application to close-out. All deadlines and compliance requirements in one place.",
    );
    expect(description).toHaveAttribute("data-slot", "teach-and-act-empty-state-description");
  });

  // Fix 3: href actions rendered via Button asChild still produce <a> tags with correct href
  it("primary href action renders an <a> tag inside Button asChild", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        primaryAction={{ label: "Go to grants", href: "/grants/new" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Go to grants" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/grants/new");
  });

  it("secondary href action renders an <a> tag inside Button asChild", () => {
    render(
      <TeachAndActEmptyState
        {...baseProps}
        secondaryAction={{ label: "Learn more", href: "/docs/grants" }}
      />,
    );
    const link = screen.getByRole("link", { name: "Learn more" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/docs/grants");
  });

  // Fix 4: className prop applied to root element
  it("applies custom className to root element", () => {
    const { container } = render(
      <TeachAndActEmptyState {...baseProps} className="custom-test-class" />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("custom-test-class");
    // also retains default classes
    expect(root).toHaveClass("rounded-2xl");
    expect(root).toHaveClass("border-border");
  });

  describe("footer slot", () => {
    it("renders footer content inside the same card element as the heading", () => {
      const { container } = render(
        <TeachAndActEmptyState
          {...baseProps}
          footer={<span data-testid="footer-content">Footer text</span>}
        />,
      );

      const heading = screen.getByRole("heading", { name: "Your grants live here" });
      const card = container.querySelector("[data-slot='teach-and-act-empty-state']");
      const footerContent = screen.getByTestId("footer-content");

      expect(card).not.toBeNull();
      expect(card?.contains(heading)).toBe(true);
      expect(card?.contains(footerContent)).toBe(true);
    });

    it("renders a divider footer wrapper with the expected data-slot", () => {
      const { container } = render(
        <TeachAndActEmptyState {...baseProps} footer={<span>Footer text</span>} />,
      );
      const footerEl = container.querySelector("[data-slot='teach-and-act-empty-state-footer']");
      expect(footerEl).not.toBeNull();
      expect(footerEl).toHaveClass("border-t");
      expect(footerEl).toHaveTextContent("Footer text");
    });

    it("does not render the divider/footer element when footer is omitted", () => {
      const { container } = render(<TeachAndActEmptyState {...baseProps} />);
      expect(
        container.querySelector("[data-slot='teach-and-act-empty-state-footer']"),
      ).not.toBeInTheDocument();
    });

    it("does not render an empty divider when footer is explicitly null", () => {
      const { container } = render(<TeachAndActEmptyState {...baseProps} footer={null} />);
      expect(
        container.querySelector("[data-slot='teach-and-act-empty-state-footer']"),
      ).not.toBeInTheDocument();
    });
  });

  // Provider-aware link rendering: injected component replaces default <a>
  describe("EmptyStateLinkProvider integration", () => {
    it("renders primary href action via the injected link component", () => {
      const Custom = ({ href, children, className }: EmptyStateLinkProps) => (
        <span data-testid="custom-primary" data-href={href} className={className}>
          {children}
        </span>
      );

      render(
        <EmptyStateLinkProvider component={Custom}>
          <TeachAndActEmptyState
            {...baseProps}
            primaryAction={{ label: "See plans", href: "/settings/billing" }}
          />
        </EmptyStateLinkProvider>,
      );

      const el = screen.getByTestId("custom-primary");
      expect(el).toHaveAttribute("data-href", "/settings/billing");
      expect(el).toHaveTextContent("See plans");
    });

    it("renders secondary href action via the injected link component", () => {
      const Custom = ({ href, children }: EmptyStateLinkProps) => (
        <span data-testid="custom-secondary" data-href={href}>
          {children}
        </span>
      );

      render(
        <EmptyStateLinkProvider component={Custom}>
          <TeachAndActEmptyState
            {...baseProps}
            secondaryAction={{ label: "Learn more", href: "/help" }}
          />
        </EmptyStateLinkProvider>,
      );

      const el = screen.getByTestId("custom-secondary");
      expect(el).toHaveAttribute("data-href", "/help");
      expect(el).toHaveTextContent("Learn more");
    });

    it("renders helpLink via the injected link component", () => {
      const Custom = ({ href, children, className }: EmptyStateLinkProps) => (
        <span data-testid="custom-help" data-href={href} className={className}>
          {children}
        </span>
      );

      render(
        <EmptyStateLinkProvider component={Custom}>
          <TeachAndActEmptyState
            {...baseProps}
            helpLink={{ label: "View docs", href: "/help#faq" }}
          />
        </EmptyStateLinkProvider>,
      );

      const el = screen.getByTestId("custom-help");
      expect(el).toHaveAttribute("data-href", "/help#faq");
      expect(el).toHaveTextContent("View docs");
    });

    it("falls back to plain <a> when no provider is present", () => {
      render(<TeachAndActEmptyState {...baseProps} helpLink={{ label: "Help", href: "/help" }} />);
      const link = screen.getByRole("link", { name: "Help" });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", "/help");
    });
  });
});
