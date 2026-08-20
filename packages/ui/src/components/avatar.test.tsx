import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

describe("Avatar", () => {
  it("renders with default md size", () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByText("AB").closest("[data-slot='avatar']");
    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute("data-size", "md");
  });

  it("renders sm size", () => {
    render(
      <Avatar size="sm">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByText("AB").closest("[data-slot='avatar']");
    expect(avatar).toHaveAttribute("data-size", "sm");
  });

  it("renders lg size", () => {
    render(
      <Avatar size="lg">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByText("AB").closest("[data-slot='avatar']");
    expect(avatar).toHaveAttribute("data-size", "lg");
  });

  it("renders AvatarFallback with correct data-slot", () => {
    render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>,
    );
    const fallback = screen.getByText("JD");
    expect(fallback).toHaveAttribute("data-slot", "avatar-fallback");
  });

  it("shows AvatarFallback when image has not loaded (jsdom environment)", () => {
    // In jsdom, images never fire a load event, so Radix Avatar shows the fallback.
    // This test verifies the fallback is visible and that AvatarImage is composed correctly.
    render(
      <Avatar>
        <AvatarImage src="/test.png" alt="Test user" />
        <AvatarFallback>TU</AvatarFallback>
      </Avatar>,
    );
    // Fallback is shown because image never loads in jsdom
    expect(screen.getByText("TU")).toBeInTheDocument();
    expect(screen.getByText("TU")).toHaveAttribute("data-slot", "avatar-fallback");
  });

  it("merges custom className on Avatar", () => {
    render(
      <Avatar className="custom-avatar">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    const avatar = screen.getByText("AB").closest("[data-slot='avatar']");
    expect(avatar).toHaveClass("custom-avatar");
  });

  it("merges custom className on AvatarFallback", () => {
    render(
      <Avatar>
        <AvatarFallback className="custom-fallback">AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("AB")).toHaveClass("custom-fallback");
  });

  it("renders AvatarFallback when AvatarImage src is not loadable", () => {
    // AvatarImage passes className to the underlying img when loaded.
    // In jsdom the image never fires load, so fallback renders instead.
    // We verify the full component tree renders without errors.
    render(
      <Avatar>
        <AvatarImage src="/x.png" alt="x" className="custom-img" />
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.getByText("AB")).toHaveAttribute("data-slot", "avatar-fallback");
  });

  it("applies size-aware text class to AvatarFallback when size is lg", () => {
    render(
      <Avatar size="lg">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>,
    );
    const fallback = screen.getByText("LG");
    expect(fallback.className).toContain("group-data-[size=lg]/avatar:text-sm");
  });
});
