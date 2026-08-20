const DEFAULT_WEB_PORT = 5173;
const DEFAULT_API_PORT = 8787;
const LOCALHOST = "localhost";

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

export function getLocalWebPort(): number {
  return parsePort(process.env.GRANTPIPE_WEB_PORT, DEFAULT_WEB_PORT);
}

export function getLocalApiPort(): number {
  return parsePort(process.env.GRANTPIPE_API_PORT, DEFAULT_API_PORT);
}

export function getLocalWebOrigin(): string {
  return `http://${LOCALHOST}:${getLocalWebPort()}`;
}

export function getLocalApiOrigin(): string {
  return `http://${LOCALHOST}:${getLocalApiPort()}`;
}

const DEFAULT_SITE_PORT = 4321;

export function getLocalSitePort(): number {
  return parsePort(process.env.GRANTPIPE_SITE_PORT, DEFAULT_SITE_PORT);
}

export function getLocalSiteOrigin(): string {
  return `http://${LOCALHOST}:${getLocalSitePort()}`;
}
