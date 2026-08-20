import { marketingKnowledge } from "@grantpipe/shared/public-kb";

export const DEFAULT_EMAIL_LOGO_URL = marketingKnowledge.brand.emailLogoUrl;
const EMAIL_LOGO_PATH = new URL(marketingKnowledge.brand.emailLogoUrl).pathname;

export function buildEmailLogoUrl(marketingUrl?: string): string {
  if (!marketingUrl) return DEFAULT_EMAIL_LOGO_URL;
  try {
    return new URL(EMAIL_LOGO_PATH, marketingUrl).toString();
  } catch {
    return DEFAULT_EMAIL_LOGO_URL;
  }
}

export function renderEmailBrandHeader(marketingUrl?: string): string {
  const logoUrl = buildEmailLogoUrl(marketingUrl);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;" data-email-brand>
<tr>
<td style="padding:16px 0;">
<img src="${logoUrl}" alt="${marketingKnowledge.brand.name} logo" width="200" style="max-width:200px;width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;display:block;" />
</td>
</tr>
</table>`;
}
