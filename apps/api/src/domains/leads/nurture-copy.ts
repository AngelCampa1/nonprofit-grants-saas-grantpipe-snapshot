import {
  buildAppUrl,
  GRANTPIPE_OS_BOILERPLATE,
  LEAD_MAGNET_TITLES,
  type LeadMagnetSlug,
  getVideoByLeadMagnet,
  youtubeWatchUrl,
  type VideoRecord,
} from "@grantpipe/shared";
import { renderEmailLayout, renderCtaButton, renderVideoCard } from "../../lib/email-layout";

export type MagnetSlug = LeadMagnetSlug;

export type DeliveryStep = {
  subject: string;
  html: (
    appUrl: string,
    unsubscribeUrl: string,
    downloadUrl: string,
    marketingUrl?: string,
  ) => string;
  text: (appUrl: string, unsubscribeUrl: string, downloadUrl: string) => string;
};

function keepFirstCtaButton(body: string): string {
  let hasCta = false;

  return body.replace(/\n?<table data-cta="true"[\s\S]*?<\/table>/g, (cta) => {
    if (hasCta) {
      return "";
    }

    hasCta = true;
    return cta;
  });
}

function layout(body: string, unsubscribeUrl: string, marketingUrl?: string): string {
  return renderEmailLayout({
    body: keepFirstCtaButton(body),
    marketingUrl,
    unsubscribeUrl,
  });
}

function textFooter(unsubscribeUrl: string): string {
  return `\n\n--\n${GRANTPIPE_OS_BOILERPLATE}\nYou're receiving this because you downloaded a resource from grantpipe.com.\nOpt out of these emails: ${unsubscribeUrl}\n`;
}

export function makeDeliveryStep(title: string, slug?: LeadMagnetSlug | null): DeliveryStep {
  const video: VideoRecord | undefined = slug ? getVideoByLeadMagnet(slug) : undefined;
  const videoCardHtml = video
    ? `<p>Want to see it built? Watch the walkthrough.</p>\n${renderVideoCard(video)}`
    : "";
  const videoCardText = video ? `\nWatch: ${youtubeWatchUrl(video.youtubeId)}\n` : "";

  return {
    subject: `Your ${title} from GrantPipe`,
    html: (appUrl, unsubscribeUrl, downloadUrl, marketingUrl) =>
      layout(
        `<p>Your ${title} is below.</p>
<p><a href="${downloadUrl}" style="color:#047857;font-weight:600;">Download your ${title}</a></p>
<p style="font-size:13px;color:#64748b;">This link expires in 7 days.</p>
${videoCardHtml}
<p>One thing worth doing today: open the first page and pick a single item to action this week. These resources work when they turn into small, specific changes, not when they sit in a folder.</p>
<p>If you have questions about the content, or about how nonprofits like yours are handling this in practice, reply directly. I read every response.</p>
${renderCtaButton(buildAppUrl(appUrl, "/signup"), "Start your trial")}
<p>- Angel Campa, founder</p>`,
        unsubscribeUrl,
        marketingUrl,
      ),
    text: (appUrl, unsubscribeUrl, downloadUrl) =>
      `Your ${title} is below.

${downloadUrl}

This link expires in 7 days.
${videoCardText}
One thing worth doing today: open the first page and pick a single item to action this week. These resources work when they turn into small, specific changes, not when they sit in a folder.

If you have questions about the content, or about how nonprofits like yours are handling this in practice, reply directly. I read every response.

Start your trial -> ${buildAppUrl(appUrl, "/signup")}

- Angel Campa, founder${textFooter(unsubscribeUrl)}`,
  };
}

export function magnetTitle(slug: string | null | undefined): string {
  if (!slug) return "resource";
  return LEAD_MAGNET_TITLES[slug as LeadMagnetSlug] ?? "resource";
}
