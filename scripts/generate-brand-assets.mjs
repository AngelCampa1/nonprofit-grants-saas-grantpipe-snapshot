import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const GREEN = "#047857";
const GOLD = "#d99a18";
const INK = "#0e1a16";
const SURFACE = "#f8faf6";
const MUTED = "#5b6e66";

const root = new URL("../", import.meta.url);

function path(relativePath) {
  return new URL(relativePath, root);
}

async function write(relativePath, contents) {
  const target = path(relativePath);
  await mkdir(dirname(target.pathname), { recursive: true });
  await writeFile(target, contents);
}

function markSvg({ appIcon = false, titleId = "grantpipe-mark-title" } = {}) {
  const background = appIcon ? `  <rect width="64" height="64" rx="14" fill="${SURFACE}"/>\n` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">GrantPipe logo</title>
${background}  <g data-logo-mark="grantpipe-mark" transform="translate(6 4)">
    <path d="M26 0 52 13.5 26 27 0 13.5Z" fill="${GREEN}"/>
    <path d="M0 19 20 29.5v28L0 47Z" fill="${GREEN}"/>
    <path d="M52 19 32 29.5v28L52 47Z" fill="${GREEN}"/>
    <path d="M20 29.5 26 32.7 32 29.5v28L26 61 20 57.5Z" fill="#ffffff"/>
    <path d="M0 13.5 5.6 10.6 26 21.2 46.4 10.6 52 13.5 26 27Z" fill="#ffffff"/>
    <rect data-gold-accent="1" x="22.1" y="30.8" width="7.8" height="8" rx="1.4" fill="${GOLD}"/>
    <rect data-gold-accent="2" x="22.1" y="43.2" width="7.8" height="8" rx="1.4" fill="${GOLD}"/>
  </g>
</svg>`;
}

function extractWordmark(source) {
  const match = source.match(/<g data-wordmark="GrantPipe">[\s\S]*?<\/g>/);
  if (!match) {
    throw new Error("Could not find path-based GrantPipe wordmark.");
  }
  return match[0];
}

function recolorWordmark(group) {
  return group
    .replace(/fill="#(?:182026|0e1a16)"/g, `fill="${INK}"`)
    .replace(/fill="#(?:145f49|047857)"/g, `fill="${GREEN}"`)
    .replace(/fill="#(?:c99a36|d99a18)"/g, `fill="${GOLD}"`);
}

function horizontalLogo({ wordmark, titleId }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 284 72" width="284" height="72" role="img" aria-labelledby="${titleId}">
  <title id="${titleId}">GrantPipe logo</title>
  <g data-logo-mark="grantpipe-mark" transform="translate(4 6)">
    <path d="M30 0 56 13.5 30 27 4 13.5Z" fill="${GREEN}"/>
    <path d="M4 19 24 29.5v28L4 47Z" fill="${GREEN}"/>
    <path d="M56 19 36 29.5v28L56 47Z" fill="${GREEN}"/>
    <path d="M24 29.5 30 32.7 36 29.5v28L30 61 24 57.5Z" fill="#ffffff"/>
    <path d="M4 13.5 9.6 10.6 30 21.2 50.4 10.6 56 13.5 30 27Z" fill="#ffffff"/>
    <rect data-gold-accent="1" x="26.1" y="30.8" width="7.8" height="8" rx="1.4" fill="${GOLD}"/>
    <rect data-gold-accent="2" x="26.1" y="43.2" width="7.8" height="8" rx="1.4" fill="${GOLD}"/>
  </g>
  ${recolorWordmark(wordmark)}
</svg>`;
}

function wordmarkSvg(wordmark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 194 72" width="194" height="72" role="img" aria-labelledby="grantpipe-wordmark-title">
  <title id="grantpipe-wordmark-title">GrantPipe</title>
  ${recolorWordmark(wordmark)}
</svg>`;
}

function htmlEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgData(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderPng(browser, { svg, output, width, height, transparent = true }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html>
      <body style="margin:0;width:${width}px;height:${height}px;display:grid;place-items:center;background:${transparent ? "transparent" : SURFACE};">
        <img src="${svgData(svg)}" width="${width}" height="${height}" style="display:block;width:${width}px;height:${height}px;object-fit:contain;" />
      </body>
    </html>`);
  await page.screenshot({ path: path(output).pathname, omitBackground: transparent });
  await page.close();
}

async function renderEmailPng(browser, { logo }) {
  const width = 468;
  const height = 120;
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html>
      <body style="margin:0;width:${width}px;height:${height}px;display:grid;place-items:center;background:transparent;">
        <img src="${svgData(logo)}" width="390" height="99" style="display:block;width:390px;height:auto;" />
      </body>
    </html>`);
  await page.screenshot({
    path: path("apps/site/public/logo-email.png").pathname,
    omitBackground: true,
  });
  await page.close();
}

async function renderOg(browser, { output, heading, eyebrow }) {
  const width = 1200;
  const height = 630;
  const logo = await readFile(path("apps/site/public/logo-light.svg"), "utf8");
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            width: ${width}px;
            height: ${height}px;
            background: ${SURFACE};
            color: ${INK};
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .frame {
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            padding: 72px;
            background:
              linear-gradient(135deg, rgba(4,120,87,0.12), rgba(217,154,24,0.10) 42%, transparent 42%),
              radial-gradient(circle at 88% 22%, rgba(4,120,87,0.13), transparent 25%),
              ${SURFACE};
          }
          .shell {
            height: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(14,26,22,0.12);
            border-radius: 28px;
            padding: 56px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            background: rgba(255,255,255,0.72);
          }
          .logo { width: 284px; height: 72px; }
          .eyebrow {
            margin: 84px 0 18px;
            color: ${GREEN};
            font-size: 26px;
            font-weight: 750;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          h1 {
            margin: 0;
            max-width: 780px;
            font-size: 78px;
            line-height: 0.98;
            letter-spacing: -0.03em;
          }
          .footer {
            color: ${MUTED};
            font-size: 28px;
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .dot {
            width: 12px;
            height: 12px;
            border-radius: 999px;
            background: ${GOLD};
          }
        </style>
      </head>
      <body>
        <main class="frame">
          <section class="shell">
            <div>
              <img class="logo" src="${svgData(logo)}" alt="" />
              <p class="eyebrow">${htmlEscape(eyebrow)}</p>
              <h1>${htmlEscape(heading)}</h1>
            </div>
            <div class="footer"><span class="dot"></span><span>grantpipe.com</span></div>
          </section>
        </main>
      </body>
    </html>`);
  await page.screenshot({ path: path(output).pathname, type: "png" });
  await page.close();
}

const existing = await readFile(path("apps/site/src/assets/logo-light.svg"), "utf8");
const wordmark = extractWordmark(existing);
const lightLogo = horizontalLogo({
  wordmark,
  titleId: "grantpipe-logo-light-title",
});
const icon = markSvg({ appIcon: false });
const appIcon = markSvg({ appIcon: true, titleId: "grantpipe-favicon-title" });
const wordmarkOnly = wordmarkSvg(wordmark);

await write("apps/site/public/logo-light.svg", lightLogo);
await write("apps/site/public/favicon.svg", appIcon);
await write("apps/site/src/assets/logo-light.svg", lightLogo);
await write("apps/site/src/assets/logo-icon.svg", icon);
await write("apps/site/src/assets/logo-wordmark.svg", wordmarkOnly);

await write("apps/web/public/favicon.svg", appIcon);
await write("apps/web/public/brand/grantpipe-logo-mark.svg", icon);
await write("apps/web/public/brand/grantpipe-logo-light.svg", lightLogo);

await write("docs/ux impromenets grantpipe/apps/web/public/brand/grantpipe-logo-mark.svg", icon);
await write(
  "docs/ux impromenets grantpipe/apps/web/public/brand/grantpipe-logo-light.svg",
  lightLogo,
);
for (const output of [
  "media/launch-video/assets/grantpipe-logo-light.svg",
  "media/launch-video/assets/grantpipe-logo-light-outro.svg",
  "media/explainer-video/assets/grantpipe-logo-light.svg",
  "media/explainer-video/assets/grantpipe-logo-light-outro.svg",
  "media/product-tour-video/assets/brand/grantpipe-logo-light.svg",
  "media/product-tour-video/assets/brand/grantpipe-logo-light-outro.svg",
]) {
  await write(output, lightLogo);
}

const browser = await chromium.launch({ headless: true });
try {
  await renderPng(browser, {
    svg: appIcon,
    output: "apps/site/public/apple-touch-icon.png",
    width: 180,
    height: 180,
    transparent: false,
  });
  await renderPng(browser, {
    svg: appIcon,
    output: "apps/web/public/apple-touch-icon.png",
    width: 180,
    height: 180,
    transparent: false,
  });
  await renderEmailPng(browser, { logo: lightLogo });

  const ogImages = [
    ["apps/site/public/og-default.png", "Compliance-first grant management system", "GrantPipe"],
    ["apps/site/public/og-guides.png", "Practical grant compliance guides", "Resources"],
    ["apps/site/public/og-alternatives.png", "Compare nonprofit software options", "Alternatives"],
    ["apps/site/public/og-pricing.png", "Transparent GrantPipe pricing", "Pricing"],
    ["apps/site/public/og-state-pages.png", "Nonprofit software by state", "State guides"],
    ["apps/site/public/og-solutions.png", "Grant workflows for every team", "Solutions"],
  ];

  for (const [output, heading, eyebrow] of ogImages) {
    await renderOg(browser, { output, heading, eyebrow });
  }
} finally {
  await browser.close();
}

console.log("Generated GrantPipe brand assets.");
