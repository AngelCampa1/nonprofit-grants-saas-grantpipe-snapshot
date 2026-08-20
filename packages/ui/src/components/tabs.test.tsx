import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function setScrollMetrics(
  el: HTMLElement,
  {
    scrollLeft,
    scrollWidth,
    clientWidth,
  }: { scrollLeft: number; scrollWidth: number; clientWidth: number },
) {
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    writable: true,
    value: scrollLeft,
  });
}

describe("Tabs", () => {
  it("renders horizontal tabs by default", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="activity">Activity content</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist.parentElement).toHaveAttribute("data-slot", "tabs");
    expect(tablist.parentElement).toHaveAttribute("data-orientation", "horizontal");
  });

  it("renders vertical tabs and line variants", () => {
    render(
      <Tabs defaultValue="overview" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="activity">Activity content</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist.parentElement).toHaveAttribute("data-orientation", "vertical");
    expect(tablist).toHaveAttribute("data-variant", "line");
  });

  it("renders the record variant for full-width detail navigation", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="activity">Activity content</TabsContent>
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("data-variant", "record");
    expect(tablist).toHaveClass("w-full", "flex-nowrap", "rounded-2xl", "border", "bg-card/85");
  });

  it("hides the native scrollbar on the record tab strip", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist.className).toContain("[scrollbar-width:none]");
    expect(tablist.className).toContain("[&::-webkit-scrollbar]:hidden");
    expect(tablist.className).not.toContain("[scrollbar-width:thin]");
  });

  it("default TabsList is pill-shaped (rounded-full)", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Content</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tablist")).toHaveClass("rounded-full");
  });

  it("TabsTrigger is pill-shaped (rounded-full)", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Content</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveClass("rounded-full");
  });

  it("gives the active trigger a clear soft-emerald fill instead of a near-invisible bg-background swap", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Content</TabsContent>
      </Tabs>,
    );
    const trigger = screen.getByRole("tab", { name: "Overview" });
    expect(trigger).toHaveClass(
      "data-[state=active]:bg-primary/10",
      "data-[state=active]:text-primary",
      "data-[state=active]:font-medium",
    );
    expect(trigger.className).not.toContain("data-[state=active]:bg-background");
  });

  it("applies the same soft-emerald active fill to record-variant triggers", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole("tab", { name: "Overview" });
    expect(trigger).toHaveClass(
      "data-[state=active]:bg-primary/10",
      "data-[state=active]:text-primary",
    );
  });

  it("keeps the line variant's underline indicator readable and does not let the emerald fill leak into it", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole("tab", { name: "Overview" });
    expect(trigger).toHaveClass(
      "group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
      "group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground",
      "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
    );
  });

  it("constrains record tabs to horizontal scrolling inside the page width", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="impact">Impact Metrics</TabsTrigger>
          <TabsTrigger value="custom">Custom Fields</TabsTrigger>
          <TabsTrigger value="volunteer">Volunteer Hours</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const tabs = screen.getByRole("tablist").parentElement;
    const tablist = screen.getByRole("tablist");

    expect(tabs).toHaveClass("min-w-0", "w-full");
    expect(tablist).toHaveClass(
      "h-auto",
      "max-w-full",
      "min-w-0",
      "overflow-x-auto",
      "flex-nowrap",
    );
    expect(tablist).not.toHaveClass("flex-wrap", "group-data-[orientation=horizontal]/tabs:h-9");
  });

  it("renders scroll-edge fade affordances for the record variant", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const scroll = screen.getByRole("tablist").parentElement;
    expect(scroll).toHaveAttribute("data-slot", "tabs-list-scroll");
    expect(scroll?.querySelector('[data-tabs-fade="start"]')).not.toBeNull();
    expect(scroll?.querySelector('[data-tabs-fade="end"]')).not.toBeNull();
  });

  it("toggles record fade visibility based on scroll position", () => {
    render(
      <Tabs defaultValue="overview">
        <TabsList variant="record">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist");
    const scroll = tablist.parentElement as HTMLElement;
    const startFade = scroll.querySelector('[data-tabs-fade="start"]') as HTMLElement;
    const endFade = scroll.querySelector('[data-tabs-fade="end"]') as HTMLElement;

    // Overflowing, scrolled to the start: only the end fade shows.
    setScrollMetrics(tablist, { scrollLeft: 0, scrollWidth: 800, clientWidth: 400 });
    act(() => {
      tablist.dispatchEvent(new Event("scroll"));
    });
    expect(startFade).toHaveAttribute("data-visible", "false");
    expect(endFade).toHaveAttribute("data-visible", "true");

    // Scrolled to the middle: both fades show.
    setScrollMetrics(tablist, { scrollLeft: 200, scrollWidth: 800, clientWidth: 400 });
    act(() => {
      tablist.dispatchEvent(new Event("scroll"));
    });
    expect(startFade).toHaveAttribute("data-visible", "true");
    expect(endFade).toHaveAttribute("data-visible", "true");

    // Scrolled to the end: only the start fade shows.
    setScrollMetrics(tablist, { scrollLeft: 400, scrollWidth: 800, clientWidth: 400 });
    act(() => {
      tablist.dispatchEvent(new Event("scroll"));
    });
    expect(startFade).toHaveAttribute("data-visible", "true");
    expect(endFade).toHaveAttribute("data-visible", "false");

    // No overflow: neither fade shows.
    setScrollMetrics(tablist, { scrollLeft: 0, scrollWidth: 400, clientWidth: 400 });
    act(() => {
      tablist.dispatchEvent(new Event("scroll"));
    });
    expect(startFade).toHaveAttribute("data-visible", "false");
    expect(endFade).toHaveAttribute("data-visible", "false");
  });
});
