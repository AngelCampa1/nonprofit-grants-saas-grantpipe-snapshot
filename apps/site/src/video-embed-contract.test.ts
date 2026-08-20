import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const videoEmbedComponent = source("./components/video-embed.astro");

describe("VideoEmbed component contract", () => {
  it("uses youtube-nocookie embed URL", () => {
    expect(videoEmbedComponent).toContain("youtube-nocookie.com/embed/");
  });

  it("implements a lazy click-to-load facade with data-youtube-embed and a play button", () => {
    expect(videoEmbedComponent).toContain("data-youtube-embed");
    expect(videoEmbedComponent).toMatch(/__play|<button/);
    expect(videoEmbedComponent).toContain("iframe");
    expect(videoEmbedComponent).toContain("click");
  });

  it("only injects iframe via script on click", () => {
    expect(videoEmbedComponent).not.toContain("<iframe");
    expect(videoEmbedComponent).toContain('document.createElement("iframe")');
    expect(videoEmbedComponent).toContain("addEventListener");
    expect(videoEmbedComponent).toContain("{ once: true }");
  });

  it("accepts youtubeId and iframeTitle props via Astro.props", () => {
    expect(videoEmbedComponent).toContain("youtubeId");
    expect(videoEmbedComponent).toContain("iframeTitle");
    expect(videoEmbedComponent).toContain("Astro.props");
  });
});
