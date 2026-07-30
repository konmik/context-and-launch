import { isPaletteName, type PaletteName } from "../src/components/shared/palette-pure.js";
import { parseMode, type AppMode } from "../src/components/shared/theme-toggle-pure.js";

// The renderer loads the app from a fixed custom-scheme origin. localStorage
// (and all other web storage) is keyed by origin, so the origin must be
// identical across launches. The main process answers app:// requests by
// invoking the server's request handler in-process: the server bundle is
// loaded into the main process, so there is no socket between the two.
export const APP_SCHEME = "app";
export const APP_HOST = "context-launch";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export interface LocalFetchInit {
  host: string;
  protocol: string;
  headers: Headers;
  method: string;
  redirect: RequestRedirect;
  body?: ArrayBuffer;
}

export type LocalFetch = (path: string, init: LocalFetchInit) => Promise<Response>;

export async function handleAppRequest(
  request: Request,
  localFetch: LocalFetch,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) {
    throw new Error(`Not an app-origin URL: ${request.url}`);
  }
  // The body is read to completion here: a ReadableStream handed straight to
  // the handler is not a supported body type and tears down the request.
  const body = request.body ? await request.arrayBuffer() : undefined;
  return localFetch(`${url.pathname}${url.search}`, {
    host: url.hostname,
    protocol: url.protocol,
    headers: request.headers,
    method: request.method,
    redirect: request.redirect,
    body,
  });
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
