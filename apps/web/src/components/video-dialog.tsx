import { useState, type ComponentProps } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@grantpipe/ui";
import { getVideo, youtubeEmbedUrl, type VideoSlug } from "@grantpipe/shared";

interface VideoDialogProps {
  slug: VideoSlug;
  triggerLabel?: string;
  className?: string;
  /**
   * Trigger button style. Defaults to the filled primary button. Pass a lighter
   * variant (e.g. "outline") when the dialog sits next to another primary CTA so
   * the two do not compete for attention.
   */
  triggerVariant?: ComponentProps<typeof Button>["variant"];
}

export function VideoDialog({ slug, triggerLabel, className, triggerVariant }: VideoDialogProps) {
  const video = getVideo(slug);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPlaying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className={className} variant={triggerVariant}>
          {triggerLabel ?? `Watch: ${video.shortTitle}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{video.title}</DialogTitle>
        </DialogHeader>
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          {playing ? (
            // No sandbox attribute: the YouTube player needs script + same-origin
            // access to run, and youtube-nocookie.com is the privacy mitigation here.
            <iframe
              title={video.title}
              src={youtubeEmbedUrl(video.youtubeId, { autoplay: true })}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Button
                onClick={() => setPlaying(true)}
                className="rounded-full"
                aria-label="Play video"
              >
                Play
              </Button>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => handleOpenChange(false)}
          className="rounded-full"
          aria-label="Close video dialog"
        >
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
