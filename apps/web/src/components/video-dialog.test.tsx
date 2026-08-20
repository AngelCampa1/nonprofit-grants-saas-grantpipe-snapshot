import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@grantpipe/ui", () => ({
  Button: ({
    children,
    onClick,
    className,
    variant,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    variant?: string;
  }) => (
    <button onClick={onClick} className={className} data-variant={variant}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    onOpenChange: _onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }) =>
    open ? <div role="dialog">{children}</div> : <div data-testid="dialog-closed">{children}</div>,
  DialogContent: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogTrigger: ({
    children,
    asChild,
    onClick,
  }: {
    children?: React.ReactNode;
    asChild?: boolean;
    onClick?: () => void;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
        onClick,
      });
    }
    return <div onClick={onClick}>{children}</div>;
  },
}));

import { VideoDialog } from "./video-dialog";
import { getVideo, youtubeEmbedUrl } from "@grantpipe/shared";

describe("VideoDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a trigger button with the default label when no triggerLabel given", () => {
    render(<VideoDialog slug="getting-started" />);
    const video = getVideo("getting-started");
    expect(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` })).toBeInTheDocument();
  });

  it("renders a trigger button with the custom triggerLabel when provided", () => {
    render(<VideoDialog slug="getting-started" triggerLabel="Play video" />);
    expect(screen.getByRole("button", { name: "Play video" })).toBeInTheDocument();
  });

  it("does NOT render an iframe before the dialog is opened", () => {
    const { container } = render(<VideoDialog slug="getting-started" />);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("does NOT render an iframe after dialog is opened but before play is clicked", () => {
    render(<VideoDialog slug="getting-started" />);
    // Click trigger to open
    const video = getVideo("getting-started");
    fireEvent.click(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` }));
    expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();
  });

  it("mounts iframe with correct src after clicking the play button", () => {
    render(<VideoDialog slug="getting-started" />);
    const video = getVideo("getting-started");

    // Open the dialog
    fireEvent.click(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` }));

    // Click the play button inside the dialog
    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    const iframe = screen.getByTitle(video.title) as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain("youtube-nocookie.com/embed/");
    expect(iframe.src).toContain(video.youtubeId);
    expect(iframe.src).toContain("autoplay=1");
  });

  it("iframe src matches youtubeEmbedUrl with autoplay", () => {
    render(<VideoDialog slug="getting-started" />);
    const video = getVideo("getting-started");

    fireEvent.click(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` }));
    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    const iframe = screen.getByTitle(video.title) as HTMLIFrameElement;
    const expectedSrc = youtubeEmbedUrl(video.youtubeId, { autoplay: true });
    expect(iframe.src).toBe(expectedSrc);
  });

  it("shows the video title in the dialog header", () => {
    render(<VideoDialog slug="getting-started" />);
    const video = getVideo("getting-started");

    fireEvent.click(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` }));

    expect(screen.getByTestId("dialog-title")).toHaveTextContent(video.title);
  });

  it("unmounts the iframe when dialog is closed (open state resets)", () => {
    render(<VideoDialog slug="getting-started" />);
    const video = getVideo("getting-started");

    // Open and start playing
    fireEvent.click(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` }));
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(screen.getByTitle(video.title)).toBeInTheDocument();

    // Click the close button inside the dialog
    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    // After close, no iframe
    expect(screen.queryByTitle(video.title)).not.toBeInTheDocument();
  });

  it("works with a different slug (single-audit)", () => {
    render(<VideoDialog slug="single-audit" />);
    const video = getVideo("single-audit");
    expect(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: `Watch: ${video.shortTitle}` }));
    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    const iframe = screen.getByTitle(video.title) as HTMLIFrameElement;
    expect(iframe.src).toContain(video.youtubeId);
  });
});
