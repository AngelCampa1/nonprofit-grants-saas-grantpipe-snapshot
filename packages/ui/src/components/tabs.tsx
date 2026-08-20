"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex min-w-0 w-full gap-2 data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-full p-[3px] text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted group-data-[orientation=horizontal]/tabs:h-9",
        line: "gap-1 bg-transparent group-data-[orientation=horizontal]/tabs:h-9",
        record:
          "h-auto max-w-full min-w-0 w-full flex-nowrap justify-start overflow-x-auto rounded-2xl border border-border bg-card/85 p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function useTabsOverflow() {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    if (!node) {
      return;
    }
    const update = () => {
      const maxScroll = node.scrollWidth - node.clientWidth;
      setOverflow({
        start: node.scrollLeft > 1,
        end: node.scrollLeft < maxScroll - 1,
      });
    };
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [node]);

  return { ref: setNode, overflow };
}

function RecordTabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { ref, overflow } = useTabsOverflow();
  return (
    <div data-slot="tabs-list-scroll" className="relative min-w-0 w-full">
      <TabsPrimitive.List
        ref={ref}
        data-slot="tabs-list"
        data-variant="record"
        className={cn(tabsListVariants({ variant: "record" }), className)}
        {...props}
      />
      <span
        aria-hidden
        data-tabs-fade="start"
        data-visible={overflow.start}
        className="pointer-events-none absolute inset-y-px left-px w-10 rounded-l-2xl bg-gradient-to-r from-card to-transparent opacity-0 transition-opacity data-[visible=true]:opacity-100"
      />
      <span
        aria-hidden
        data-tabs-fade="end"
        data-visible={overflow.end}
        className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-2xl bg-gradient-to-l from-card to-transparent opacity-0 transition-opacity data-[visible=true]:opacity-100"
      />
    </div>
  );
}

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  if (variant === "record") {
    return <RecordTabsList className={className} {...props} />;
  }
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground",
        "group-data-[variant=record]/tabs-list:min-h-9 group-data-[variant=record]/tabs-list:flex-none group-data-[variant=record]/tabs-list:px-4",
        "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-medium",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
