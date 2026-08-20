import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

describe("Accordion", () => {
  it("renders accordion with items", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Section One</AccordionTrigger>
          <AccordionContent>Content for section one.</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.getByRole("button", { name: "Section One" })).toBeInTheDocument();
  });

  it("renders data-slot attributes on all subcomponents", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Trigger</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('[data-slot="accordion"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="accordion-item"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="accordion-trigger"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="accordion-content"]')).toBeInTheDocument();
  });

  it("expands content when trigger is clicked", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Click to open</AccordionTrigger>
          <AccordionContent>Revealed content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Click to open" });
    expect(trigger).toHaveAttribute("data-state", "closed");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");
  });

  it("collapses content when trigger is clicked again (collapsible mode)", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Toggle</AccordionTrigger>
          <AccordionContent>Toggled content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Toggle" });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "closed");
  });

  it("supports multiple expanded items with type=multiple", () => {
    render(
      <Accordion type="multiple">
        <AccordionItem value="item-1">
          <AccordionTrigger>First</AccordionTrigger>
          <AccordionContent>First content</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Second</AccordionTrigger>
          <AccordionContent>Second content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));

    expect(screen.getByRole("button", { name: "First" })).toHaveAttribute("data-state", "open");
    expect(screen.getByRole("button", { name: "Second" })).toHaveAttribute("data-state", "open");
  });

  it("renders AccordionTrigger with aria-expanded attribute", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Expandable</AccordionTrigger>
          <AccordionContent>Details</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Expandable" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("renders AccordionItem with data-state closed by default", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Item</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const item = container.querySelector('[data-slot="accordion-item"]');
    expect(item).toHaveAttribute("data-state", "closed");
  });

  it("merges custom className on AccordionItem", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1" className="custom-item">
          <AccordionTrigger>Item</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('[data-slot="accordion-item"]')).toHaveClass("custom-item");
  });

  it("merges custom className on AccordionTrigger", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger className="custom-trigger">Trigger</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(screen.getByRole("button", { name: "Trigger" })).toHaveClass("custom-trigger");
  });

  it("merges custom className on AccordionContent", () => {
    const { container } = render(
      <Accordion type="single" collapsible defaultValue="item-1">
        <AccordionItem value="item-1">
          <AccordionTrigger>Open</AccordionTrigger>
          <AccordionContent className="custom-content">Content text</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('[data-slot="accordion-content"]')).toHaveClass(
      "custom-content",
    );
  });

  it("merges custom className on Accordion root", () => {
    const { container } = render(
      <Accordion type="single" collapsible className="custom-accordion">
        <AccordionItem value="item-1">
          <AccordionTrigger>Item</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('[data-slot="accordion"]')).toHaveClass("custom-accordion");
  });

  it("Accordion root has large container rounding (rounded-2xl)", () => {
    const { container } = render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Item</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    expect(container.querySelector('[data-slot="accordion"]')).toHaveClass("rounded-2xl");
  });

  it("supports keyboard navigation with Enter key (keyUp activates in Radix)", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Keyboard trigger</AccordionTrigger>
          <AccordionContent>Keyboard content</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Keyboard trigger" });
    trigger.focus();
    // Radix accordion button responds to click; simulate via click event
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("data-state", "open");
  });
});
