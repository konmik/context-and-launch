import { isPaletteName, type PaletteName } from "../src/components/shared/palette-pure.js";
import { parseMode, type AppMode } from "../src/components/shared/theme-toggle-pure.js";

// The renderer loads the app from a fixed custom-scheme origin instead of the
// local HTTP server's ephemeral port. localStorage (and all other web storage)
// is keyed by origin, so the origin must be identical across launches; the
// server port is not. The main process proxies app:// requests to the server.
export const APP_SCHEME = "app";
export const APP_HOST = "context-launch";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

function serverHost(port: number): string {
  return `127.0.0.1:${port}`;
}

export function toServerUrl(requestUrl: string, port: number): string {
  const url = new URL(requestUrl);
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    throw new Error(`Not an app-origin URL: ${requestUrl}`);
  }
  return `http://${serverHost(port)}${url.pathname}${url.search}`;
}

// Chromium's network stack rejects forwarded requests whose Referer or Origin
// carries the custom scheme, so both are rewritten to the server origin.
export function toServerHeaders(headers: Headers, port: number): Headers {
  const out = new Headers(headers);
  const referer = out.get("referer");
  if (referer !== null && referer.startsWith(APP_ORIGIN)) {
    out.set("referer", toServerUrl(referer, port));
  }
  if (out.get("origin") === APP_ORIGIN) {
    out.set("origin", `http://${serverHost(port)}`);
  }
  return out;
}

export function rewriteLocation(location: string, port: number): string {
  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch {
    return location;
  }
  if (parsed.protocol === "http:" && parsed.host === serverHost(port)) {
    return `${APP_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return location;
}

// One-time migration of the appearance persisted by the main process
// (window-state.json) into the app-origin localStorage: the main process
// passes its stored palette and mode to the preload script via
// additionalArguments, and the preload seeds any keys the renderer has not
// written itself. Renderer writes remain the source of truth after that.
const PALETTE_ARG = "--context-launch-palette=";
const MODE_ARG = "--context-launch-mode=";

export function appearanceArgs(palette: PaletteName, mode: AppMode): string[] {
  return [`${PALETTE_ARG}${palette}`, `${MODE_ARG}${mode}`];
}

function argValue(argv: readonly string[], prefix: string): string | undefined {
  const arg = argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

export interface SeedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function seedAppearance(storage: SeedStorage, argv: readonly string[]): void {
  const palette = argValue(argv, PALETTE_ARG);
  if (isPaletteName(palette) && storage.getItem("palette") === null) {
    storage.setItem("palette", palette);
  }
  const mode = parseMode(argValue(argv, MODE_ARG));
  if (mode !== undefined && storage.getItem("theme") === null) {
    storage.setItem("theme", mode);
  }
}
