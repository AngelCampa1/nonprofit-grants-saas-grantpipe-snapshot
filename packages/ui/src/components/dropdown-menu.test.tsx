import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

describe("DropdownMenu", () => {
  it("renders menu content, variants, and nested content", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Actions</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem variant="destructive">
              Delete
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked>Subscribed</DropdownMenuCheckboxItem>
            <DropdownMenuRadioGroup value="all">
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSub open>
              <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Archive</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Open menu" }));

    expect(await screen.findByText("Actions")).toHaveAttribute("data-slot", "dropdown-menu-label");
    expect(screen.getByText("Delete").closest('[data-slot="dropdown-menu-item"]')).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(screen.getByText("⌘⌫")).toHaveAttribute("data-slot", "dropdown-menu-shortcut");
    expect(
      screen.getByText("Subscribed").closest('[data-slot="dropdown-menu-checkbox-item"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByText("All").closest('[data-slot="dropdown-menu-radio-item"]'),
    ).toBeInTheDocument();
    expect(await screen.findByText("Archive")).toBeInTheDocument();
  });

  it("renders portal content directly", async () => {
    render(
      <DropdownMenu open>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuItem>Portaled action</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>,
    );

    expect(await screen.findByText("Portaled action")).toBeInTheDocument();
  });
});
