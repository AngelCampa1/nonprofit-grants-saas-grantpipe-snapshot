import { marketingKnowledge } from "@grantpipe/shared/public-kb";

/**
 * Bump this string whenever the renderPdfHtml output changes in a way that
 * should invalidate previously cached PDFs. It is incorporated into each
 * entry's contentHash so incremental builds detect the change automatically.
 */
export const PDF_TEMPLATE_VERSION = "1.0.0";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const PDF_HEADER_TEMPLATE = "";

export const PDF_FOOTER_TEMPLATE = `
  <div style="width:100%; font-size:9px; color:#9ca3af; padding:0 25mm; display:flex; justify-content:space-between; box-sizing:border-box;">
    <span>${marketingKnowledge.brand.domain} | <span class="url"></span></span>
    <span>Page <span class="pageNumber"></span></span>
  </div>
`;

const COVER_LOGO_SVG = `
      <svg
        class="cover-logo"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 284 72"
        width="284"
        height="72"
        role="img"
        aria-label="GrantPipe logo"
      >
        <g data-logo-mark="grantpipe-mark" transform="translate(4 6)">
          <path d="M30 0 56 13.5 30 27 4 13.5Z" fill="#047857"/>
          <path d="M4 19 24 29.5v28L4 47Z" fill="#047857"/>
          <path d="M56 19 36 29.5v28L56 47Z" fill="#047857"/>
          <path d="M24 29.5 30 32.7 36 29.5v28L30 61 24 57.5Z" fill="#ffffff"/>
          <path d="M4 13.5 9.6 10.6 30 21.2 50.4 10.6 56 13.5 30 27Z" fill="#ffffff"/>
          <rect data-gold-accent="1" x="26.1" y="30.8" width="7.8" height="8" rx="1.4" fill="#d99a18"/>
          <rect data-gold-accent="2" x="26.1" y="43.2" width="7.8" height="8" rx="1.4" fill="#d99a18"/>
        </g>
        <g data-wordmark="GrantPipe">
          <path d="M99.4189453125 37.9990234375V33.416015625H111.2568359375V44.251953125Q109.53125 45.921875 106.25634765625 47.19287109375Q102.9814453125 48.4638671875 99.623046875 48.4638671875Q95.35546875 48.4638671875 92.1826171875 46.67333984375Q89.009765625 44.8828125 87.4140625 41.55224609375Q85.818359375 38.2216796875 85.818359375 34.306640625Q85.818359375 30.0576171875 87.599609375 26.7548828125Q89.380859375 23.4521484375 92.8134765625 21.689453125Q95.4296875 20.3349609375 99.326171875 20.3349609375Q104.3916015625 20.3349609375 107.23974609375 22.45947265625Q110.087890625 24.583984375 110.904296875 28.33203125L105.44921875 29.3525390625Q104.8740234375 27.3486328125 103.28759765625 26.18896484375Q101.701171875 25.029296875 99.326171875 25.029296875Q95.7265625 25.029296875 93.60205078125 27.3115234375Q91.4775390625 29.59375 91.4775390625 34.083984375Q91.4775390625 38.9267578125 93.6298828125 41.34814453125Q95.7822265625 43.76953125 99.2705078125 43.76953125Q100.99609375 43.76953125 102.73095703125 43.09228515625Q104.4658203125 42.4150390625 105.708984375 41.4501953125V37.9990234375Z M121.2763671875 48.0H116.0625V28.294921875H120.9052734375V31.0966796875Q122.1484375 29.111328125 123.14111328125 28.48046875Q124.1337890625 27.849609375 125.3955078125 27.849609375Q127.1767578125 27.849609375 128.828125 28.8330078125L127.2138671875 33.37890625Q125.896484375 32.525390625 124.7646484375 32.525390625Q123.669921875 32.525390625 122.9091796875 33.12841796875Q122.1484375 33.7314453125 121.71240234375 35.30859375Q121.2763671875 36.8857421875 121.2763671875 41.9140625Z M134.9697265625 34.306640625 130.23828125 33.453125Q131.0361328125 30.595703125 132.984375 29.22265625Q134.9326171875 27.849609375 138.7734375 27.849609375Q142.26171875 27.849609375 143.96875 28.67529296875Q145.67578125 29.5009765625 146.37158203125 30.77197265625Q147.0673828125 32.04296875 147.0673828125 35.4384765625L147.01171875 41.5244140625Q147.01171875 44.1220703125 147.26220703125 45.35595703125Q147.5126953125 46.58984375 148.19921875 48.0H143.041015625Q142.8369140625 47.48046875 142.5400390625 46.4599609375Q142.41015625 45.99609375 142.3544921875 45.84765625Q141.0185546875 47.146484375 139.4970703125 47.7958984375Q137.9755859375 48.4453125 136.25 48.4453125Q133.20703125 48.4453125 131.45361328125 46.7939453125Q129.7001953125 45.142578125 129.7001953125 42.619140625Q129.7001953125 40.94921875 130.498046875 39.64111328125Q131.2958984375 38.3330078125 132.73388671875 37.63720703125Q134.171875 36.94140625 136.880859375 36.421875Q140.5361328125 35.7353515625 141.9462890625 35.1416015625V34.6220703125Q141.9462890625 33.119140625 141.2041015625 32.47900390625Q140.4619140625 31.8388671875 138.40234375 31.8388671875Q137.0107421875 31.8388671875 136.2314453125 32.38623046875Q135.4521484375 32.93359375 134.9697265625 34.306640625ZM141.9462890625 38.537109375Q140.9443359375 38.87109375 138.7734375 39.3349609375Q136.6025390625 39.798828125 135.9345703125 40.244140625Q134.9140625 40.9677734375 134.9140625 42.0810546875Q134.9140625 43.17578125 135.73046875 43.9736328125Q136.546875 44.771484375 137.80859375 44.771484375Q139.21875 44.771484375 140.4990234375 43.84375Q141.4453125 43.138671875 141.7421875 42.1181640625Q141.9462890625 41.4501953125 141.9462890625 39.576171875Z M170.130859375 48.0H164.9169921875V37.943359375Q164.9169921875 34.751953125 164.5830078125 33.81494140625Q164.2490234375 32.8779296875 163.49755859375 32.3583984375Q162.74609375 31.8388671875 161.6884765625 31.8388671875Q160.333984375 31.8388671875 159.2578125 32.5810546875Q158.181640625 33.3232421875 157.78271484375 34.5478515625Q157.3837890625 35.7724609375 157.3837890625 39.0751953125V48.0H152.169921875V28.294921875H157.0126953125V31.189453125Q159.591796875 27.849609375 163.5068359375 27.849609375Q165.232421875 27.849609375 166.6611328125 28.47119140625Q168.08984375 29.0927734375 168.82275390625 30.0576171875Q169.5556640625 31.0224609375 169.84326171875 32.2470703125Q170.130859375 33.4716796875 170.130859375 35.75390625Z M184.455078125 28.294921875V32.451171875H180.892578125V40.392578125Q180.892578125 42.8046875 180.99462890625 43.20361328125Q181.0966796875 43.6025390625 181.45849609375 43.8623046875Q181.8203125 44.1220703125 182.33984375 44.1220703125Q183.0634765625 44.1220703125 184.4365234375 43.62109375L184.8818359375 47.666015625Q183.0634765625 48.4453125 180.7626953125 48.4453125Q179.3525390625 48.4453125 178.220703125 47.97216796875Q177.0888671875 47.4990234375 176.56005859375 46.74755859375Q176.03125 45.99609375 175.8271484375 44.7158203125Q175.66015625 43.806640625 175.66015625 41.0419921875V32.451171875H173.2666015625V28.294921875H175.66015625V24.3798828125L180.892578125 21.3369140625V28.294921875Z" fill="#0e1a16"/>
          <path d="M192.1103515625 48.0V20.798828125H200.923828125Q205.93359375 20.798828125 207.455078125 21.20703125Q209.79296875 21.8193359375 211.3701171875 23.86962890625Q212.947265625 25.919921875 212.947265625 29.1669921875Q212.947265625 31.671875 212.0380859375 33.37890625Q211.12890625 35.0859375 209.72802734375 36.06005859375Q208.3271484375 37.0341796875 206.8798828125 37.349609375Q204.9130859375 37.7392578125 201.18359375 37.7392578125H197.6025390625V48.0ZM197.6025390625 25.400390625V33.119140625H200.6083984375Q203.85546875 33.119140625 204.9501953125 32.6923828125Q206.044921875 32.265625 206.66650390625 31.3564453125Q207.2880859375 30.447265625 207.2880859375 29.2412109375Q207.2880859375 27.7568359375 206.416015625 26.7919921875Q205.5439453125 25.8271484375 204.2080078125 25.5859375Q203.224609375 25.400390625 200.255859375 25.400390625Z M217.4189453125 25.623046875V20.798828125H222.6328125V25.623046875ZM217.4189453125 48.0V28.294921875H222.6328125V48.0Z M227.828125 28.294921875H232.689453125V31.189453125Q233.6357421875 29.705078125 235.25 28.77734375Q236.8642578125 27.849609375 238.8310546875 27.849609375Q242.263671875 27.849609375 244.6572265625 30.5400390625Q247.05078125 33.23046875 247.05078125 38.0361328125Q247.05078125 42.9716796875 244.638671875 45.70849609375Q242.2265625 48.4453125 238.7939453125 48.4453125Q237.1611328125 48.4453125 235.83447265625 47.7958984375Q234.5078125 47.146484375 233.0419921875 45.5693359375V55.49609375H227.828125ZM232.986328125 37.8134765625Q232.986328125 41.134765625 234.3037109375 42.72119140625Q235.62109375 44.3076171875 237.513671875 44.3076171875Q239.33203125 44.3076171875 240.5380859375 42.85107421875Q241.744140625 41.39453125 241.744140625 38.0732421875Q241.744140625 34.974609375 240.5009765625 33.4716796875Q239.2578125 31.96875 237.4208984375 31.96875Q235.509765625 31.96875 234.248046875 33.44384765625Q232.986328125 34.9189453125 232.986328125 37.8134765625Z M262.599609375 41.728515625 267.794921875 42.6005859375Q266.79296875 45.4580078125 264.63134765625 46.95166015625Q262.4697265625 48.4453125 259.22265625 48.4453125Q254.0830078125 48.4453125 251.615234375 45.0869140625Q249.6669921875 42.396484375 249.6669921875 38.2958984375Q249.6669921875 33.3974609375 252.2275390625 30.62353515625Q254.7880859375 27.849609375 258.703125 27.849609375Q263.1005859375 27.849609375 265.642578125 30.75341796875Q268.1845703125 33.6572265625 268.0732421875 39.650390625H255.0107421875Q255.06640625 41.9697265625 256.2724609375 43.25927734375Q257.478515625 44.548828125 259.2783203125 44.548828125Q260.5029296875 44.548828125 261.337890625 43.880859375Q262.1728515625 43.212890625 262.599609375 41.728515625ZM262.896484375 36.458984375Q262.8408203125 34.1953125 261.7275390625 33.01708984375Q260.6142578125 31.8388671875 259.0185546875 31.8388671875Q257.3115234375 31.8388671875 256.1982421875 33.08203125Q255.0849609375 34.3251953125 255.103515625 36.458984375Z" fill="#047857"/>
          <circle cx="275.6" cy="22" r="5" fill="#d99a18"/>
        </g>
      </svg>`;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractH2Texts(bodyHtml: string): string[] {
  const matches: string[] = [];
  const pattern = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(bodyHtml)) !== null) {
    // Strip inner HTML tags and decode entities to get plain text
    const text = decodeEntities(match[1]!.replace(/<[^>]+>/g, "")).trim();
    if (text) {
      matches.push(text);
    }
  }
  return matches;
}

export function renderPdfHtml(params: {
  title: string;
  bluf: string;
  slug: string;
  bodyHtml: string;
  publishedAt?: string;
}): string {
  const { title, bluf, slug, bodyHtml, publishedAt } = params;
  const h2Headings = extractH2Texts(bodyHtml);

  const tocEntries = h2Headings
    .map((heading, index) => {
      const num = String(index + 1).padStart(2, "0");
      return `
      <div class="toc-entry">
        <span class="toc-num">${num}</span>
        <span class="toc-title">${escHtml(heading)}</span>
      </div>`;
    })
    .join("\n");

  const publishedLine = publishedAt
    ? `<span class="cover-date">${escHtml(publishedAt)}</span> &middot; `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap');

    @page {
      margin: 20mm 25mm;
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 11.5pt;
      line-height: 14.5pt;
      color: #1f2937;
      margin: 0;
      padding: 0;
    }

    /* ------------------------------------------------------------------ */
    /* Cover page                                                           */
    /* ------------------------------------------------------------------ */
    #cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .cover-band {
      background-color: #047857;
      height: 120px;
      display: flex;
      align-items: center;
      padding: 0 32px;
    }

    .cover-logo-panel {
      display: inline-flex;
      align-items: center;
      padding: 10px 14px;
      background: #fffdf8;
      border-radius: 12px;
      box-shadow: 0 10px 24px rgba(14, 26, 22, 0.14);
    }

    .cover-logo {
      width: 284px;
      height: 72px;
      display: block;
    }

    .cover-body {
      padding: 48px 32px 0;
      flex: 1;
    }

    .cover-title {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 26pt;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 16px 0;
      line-height: 1.2;
    }

    .cover-bluf {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 13pt;
      line-height: 1.5;
      color: #4b5563;
      margin: 0 0 20px 0;
      max-width: 540px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .cover-kicker {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 9pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cover-footer {
      padding: 24px 32px 32px;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 9pt;
      color: #6b7280;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid #e5e7eb;
      margin-top: 32px;
    }

    /* ------------------------------------------------------------------ */
    /* TOC page                                                             */
    /* ------------------------------------------------------------------ */
    #toc {
      page-break-after: always;
      padding: 0 4px;
    }

    .toc-heading {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 18pt;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 32px 0;
      padding-bottom: 8px;
      border-bottom: 2px solid #d1fae5;
    }

    .toc-entry {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #f3f4f6;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 10.5pt;
      color: #374151;
    }

    .toc-num {
      flex-shrink: 0;
      width: 28px;
      font-weight: 600;
      color: #047857;
      font-variant-numeric: tabular-nums;
      font-size: 10pt;
    }

    .toc-title {
      flex: 1;
    }

    .toc-promo {
      margin-top: 48px;
      padding: 16px;
      background: #f0fdf4;
      border-left: 3px solid #047857;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 9pt;
      color: #374151;
    }

    /* ------------------------------------------------------------------ */
    /* Body pages                                                           */
    /* ------------------------------------------------------------------ */
    #body {
      padding: 0 4px;
    }

    h1 {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 20pt;
      font-weight: 700;
      color: #1f2937;
    }

    h2 {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 14pt;
      font-weight: 700;
      color: #047857;
      border-bottom: 2px solid #d1fae5;
      padding-bottom: 4px;
      margin-top: 28px;
      margin-bottom: 12px;
    }

    h3 {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 11.5pt;
      font-weight: 600;
      color: #374151;
      margin-top: 20px;
      margin-bottom: 8px;
    }

    p {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 11.5pt;
      line-height: 14.5pt;
      color: #1f2937;
      margin: 10px 0;
    }

    ul, ol {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 11.5pt;
      line-height: 14.5pt;
      padding-left: 22px;
      margin: 8px 0;
    }

    li {
      margin: 4px 0;
    }

    blockquote {
      border-left: 3px solid #c2410c;
      background: #fff7ed;
      padding: 12px 16px;
      border-radius: 4px;
      margin: 16px 0;
      color: #374151;
    }

    strong {
      color: #111827;
    }

    code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10pt;
      background: #f1f5f9;
      border-radius: 3px;
      padding: 1px 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 10pt;
      margin: 16px 0;
    }

    thead tr {
      background: #047857;
      color: #ffffff;
    }

    thead th {
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
    }

    tbody tr:nth-child(odd) {
      background: #f9fafb;
    }

    tbody td {
      padding: 6px 10px;
      color: #1f2937;
      border-bottom: 1px solid #e5e7eb;
    }

    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 24px 0;
    }

    em {
      color: #6b7280;
    }

    /* ------------------------------------------------------------------ */
    /* CTA page                                                             */
    /* ------------------------------------------------------------------ */
    #cta {
      page-break-before: always;
      text-align: center;
      padding-top: 32px;
      border-top: 4px solid #047857;
    }

    .cta-heading {
      font-family: 'Inter', Arial, sans-serif;
      font-size: 20pt;
      font-weight: 700;
      color: #1f2937;
      margin: 0 auto 16px;
      max-width: 480px;
      border-bottom: none;
      padding-bottom: 0;
    }

    .cta-body {
      font-family: 'Source Serif 4', Georgia, serif;
      font-size: 11.5pt;
      color: #4b5563;
      margin: 0 auto 32px;
      max-width: 420px;
      line-height: 1.6;
    }

    .cta-button {
      display: inline-block;
      background: #047857;
      color: #ffffff !important;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 11pt;
      font-weight: 600;
      padding: 12px 28px;
      border-radius: 6px;
      text-decoration: none;
      letter-spacing: 0.2px;
    }

    .cta-contact {
      margin-top: 24px;
      font-family: 'Inter', Arial, sans-serif;
      font-size: 9pt;
      color: #6b7280;
    }
  </style>
</head>
<body>

  <!-- Cover page -->
  <div id="cover">
    <div class="cover-band">
      <div class="cover-logo-panel">
${COVER_LOGO_SVG}
      </div>
    </div>
    <div class="cover-body">
      <h1 class="cover-title">${escHtml(title)}</h1>
      <p class="cover-bluf">${escHtml(bluf)}</p>
      <p class="cover-kicker">Prepared for nonprofit finance &amp; development leaders</p>
    </div>
    <div class="cover-footer">
      <span>${publishedLine}<span class="cover-domain">${escHtml(marketingKnowledge.brand.domain)}</span></span>
      <span>Lead magnet: ${escHtml(slug)}</span>
    </div>
  </div>

  <!-- TOC page -->
  <div id="toc">
    <h2 class="toc-heading">Table of Contents</h2>
    ${tocEntries}
    <div class="toc-promo">
      ${escHtml(marketingKnowledge.productPositioning.boilerplate)} <strong>${escHtml(marketingKnowledge.brand.domain)}</strong>
    </div>
  </div>

  <!-- Body pages -->
  <div id="body">
    ${bodyHtml}
  </div>

  <!-- CTA page -->
  <div id="cta">
    <h2 class="cta-heading">Ready to manage grants without spreadsheets?</h2>
    <p class="cta-body">${escHtml(marketingKnowledge.productPositioning.boilerplate)}</p>
    <a href="${escHtml(marketingKnowledge.brand.signupUrl)}" class="cta-button">${escHtml(marketingKnowledge.ctas.trial.label)}</a>
    <p class="cta-contact">Questions? Email <a href="mailto:${escHtml(marketingKnowledge.contact.publicEmail)}">${escHtml(marketingKnowledge.contact.publicEmail)}</a></p>
  </div>

</body>
</html>`;
}
