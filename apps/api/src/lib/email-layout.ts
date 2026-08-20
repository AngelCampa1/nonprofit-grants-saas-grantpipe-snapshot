import {
  GRANTPIPE_OS_BOILERPLATE,
  type VideoRecord,
  youtubeWatchUrl,
  youtubeThumbnailUrl,
} from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { renderEmailBrandHeader } from "./email-brand";

export interface EmailLayoutOptions {
  body: string;
  marketingUrl?: string;
  /**
   * Pass for marketing/nurture emails to show a footer unsubscribe link.
   * Omit for transactional emails (password reset, billing).
   */
  unsubscribeUrl?: string;
  preheader?: string;
  /**
   * Override the "received-because" footer line. Defaults to the lead-magnet
   * copy when unsubscribeUrl is present, or omitted for transactional emails.
   */
  receivedBecause?: string;
}

/**
 * Outlook-safe pill CTA button in GrantPipe emerald green.
 * The outer table has data-cta="true" so tests can grep for it without HTML parsing.
 */
export function renderCtaButton(href: string, label: string): string {
  const safeHref = sanitizeEmailHref(href);
  const safeLabel = escapeEmailHtmlText(label);
  return `<table data-cta="true" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
<tr>
<td style="border-radius:9999px;background:#047857;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:40px;v-text-anchor:middle;width:200px;" arcsize="50%" stroke="f" fillcolor="#047857"><w:anchorlock/><center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;">${safeLabel}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-->
<a href="${safeHref}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:9999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:600;mso-hide:all;">${safeLabel}</a>
<!--<![endif]-->
</td>
</tr>
</table>`;
}

export function renderListUnsubscribeHeader(unsubscribeUrl: string): string {
  return `<mailto:${marketingKnowledge.contact.supportEmail}?subject=Unsubscribe>, <${unsubscribeUrl}>`;
}

export function escapeEmailHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sanitizeEmailHref(href: string): string {
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "#";
    return escapeEmailHtmlText(href);
  } catch {
    return "#";
  }
}

/**
 * Outlook-safe table-based video card for emails.
 * Renders a clickable thumbnail, title, and "Watch on YouTube" text link.
 * The outer table has data-video-card="true" so tests/callers can detect it.
 */
export function renderVideoCard(record: VideoRecord): string {
  const watchUrl = youtubeWatchUrl(record.youtubeId);
  const thumbnailUrl = youtubeThumbnailUrl(record.youtubeId);
  const safeWatchUrl = sanitizeEmailHref(watchUrl);
  const safeThumbnailUrl = sanitizeEmailHref(thumbnailUrl);
  const displayTitle = escapeEmailHtmlText(record.shortTitle || record.title);
  const altText = escapeEmailHtmlText(record.title);

  return `<table data-video-card="true" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%;max-width:560px;">
<tr>
<td>
<a href="${safeWatchUrl}" style="display:block;text-decoration:none;"><img src="${safeThumbnailUrl}" width="560" alt="${altText}" style="display:block;width:100%;max-width:560px;border-radius:8px;border:0;" /></a>
</td>
</tr>
<tr>
<td style="padding:12px 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;font-weight:600;color:#0f172a;line-height:1.4;">${displayTitle}</td>
</tr>
<tr>
<td style="padding:4px 0 0;"><a href="${safeWatchUrl}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;color:#047857;text-decoration:underline;">Watch on YouTube</a></td>
</tr>
</table>`;
}

function renderParagraph(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `<p>${trimmed}</p>` : "";
}

function moveCtaTablesOutOfParagraphs(body: string): string {
  const paragraphWithCta =
    /<p>((?:(?!<\/p>)[\s\S])*?)(<table data-cta="true"[\s\S]*?<\/table>)((?:(?!<\/p>)[\s\S])*?)<\/p>/g;

  let current = body;
  let next = current.replace(
    paragraphWithCta,
    (_match: string, before: string, cta: string, after: string) =>
      [renderParagraph(before), cta, renderParagraph(after)].filter(Boolean).join("\n"),
  );

  while (next !== current) {
    current = next;
    next = current.replace(
      paragraphWithCta,
      (_match: string, before: string, cta: string, after: string) =>
        [renderParagraph(before), cta, renderParagraph(after)].filter(Boolean).join("\n"),
    );
  }

  return current;
}

/**
 * Full HTML email document with shared GrantPipe layout.
 * Pass unsubscribeUrl only for marketing/nurture emails; omit for transactional.
 */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
  const preheaderHtml = opts.preheader
    ? `<div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${opts.preheader.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
    : "";

  const unsubscribeHtml = opts.unsubscribeUrl
    ? ` <a href="${opts.unsubscribeUrl.replace(/"/g, "&quot;")}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>.`
    : "";

  const receivedBecause =
    opts.receivedBecause ?? (opts.unsubscribeUrl ? marketingKnowledge.emails.leadFooterCopy : "");

  const footerLine = receivedBecause
    ? `${receivedBecause}${unsubscribeHtml}`
    : unsubscribeHtml.trimStart();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GrantPipe</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;margin:0;padding:0;background:#f8fafc;">
${preheaderHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;">
<tr>
<td align="center" style="padding:24px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;padding:32px;">
<tr>
<td>
${renderEmailBrandHeader(opts.marketingUrl)}
${moveCtaTablesOutOfParagraphs(opts.body)}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px;" />
<p style="font-size:12px;color:#64748b;margin:0;line-height:1.5;">
${GRANTPIPE_OS_BOILERPLATE}${footerLine ? `<br />${footerLine}` : ""}
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
