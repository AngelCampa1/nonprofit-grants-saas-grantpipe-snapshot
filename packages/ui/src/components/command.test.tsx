import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./command";

describe("Command", () => {
  it("does not expose dialog title or description when closed", () => {
    render(
      <CommandDialog open={false} title="Command palette" description="Quick navigation">
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandGroup heading="Actions">
            <CommandItem value="sync">Sync</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Command palette")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick navigation")).not.toBeInTheDocument();
  });

  it("renders command dialog content and primitive slots", () => {
    render(
      <CommandDialog defaultOpen title="Quick actions" description="Search shortcuts">
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandGroup heading="Actions">
            <CommandItem value="new-donor">
              New donor
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
        </CommandList>
      </CommandDialog>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search...")).toHaveAttribute("data-slot", "command-input");
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("⌘N")).toHaveAttribute("data-slot", "command-shortcut");
    expect(screen.getByText("New donor").closest('[data-slot="command-item"]')).toBeInTheDocument();
  });

  it("supports hiding the close button", () => {
    render(
      <CommandDialog defaultOpen showCloseButton={false}>
        <CommandList>
          <CommandGroup heading="Actions">
            <CommandItem value="sync">Sync</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>,
    );

    fireEvent.pointerDown(screen.getByText("Sync"));
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("renders the empty state when no command items match", () => {
    render(
      <CommandDialog defaultOpen>
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem value="archive">Archive</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>,
    );

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "missing" } });

    expect(screen.getByText("No results found.")).toHaveAttribute("data-slot", "command-empty");
  });
});
