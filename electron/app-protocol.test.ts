import { describe, it, expect } from "vitest";
import {
  APP_ORIGIN,
  toServerUrl,
  toServerHeaders,
  rewriteLocation,
  rewriteRedirect,
  appearanceArgs,
  seedAppearance,
} from "./app-protocol.js";
import { projectSlugFromUrl } from "./window-bookkeeping.js";

describe("toServerUrl", () => {
  it("maps an app-origin URL to the local server, preserving path and query", () => {
    expect(toServerUrl(`${APP_ORIGIN}/project/my-repo?x=1`, 5173)).toBe(
      "http://127.0.0.1:5173/project/my-repo?x=1",
    );
  });

  it("maps the app-origin root", () => {
    expect(toServerUrl(`${APP_ORIGIN}/`, 4321)).toBe("http://127.0.0.1:4321/");
  });

  it("throws on a URL from a different origin", () => {
    expect(() => toServerUrl("http://evil.example/steal", 5173)).toThrow();
  });
});

describe("toServerHeaders", () => {
  it("rewrites app-origin referer and origin to the server origin", () => {
    const headers = toServerHeaders(
      new Headers({ referer: `${APP_ORIGIN}/project/x`, origin: APP_ORIGIN, accept: "*/*" }),
      5173,
    );
    expect(headers.get("referer")).toBe("http://127.0.0.1:5173/project/x");
    expect(headers.get("origin")).toBe("http://127.0.0.1:5173");
    expect(headers.get("accept")).toBe("*/*");
  });

  it("leaves headers without app-origin values unchanged", () => {
    const headers = toServerHeaders(new Headers({ accept: "text/html" }), 5173);
    expect(headers.get("referer")).toBeNull();
    expect(headers.get("origin")).toBeNull();
    expect(headers.get("accept")).toBe("text/html");
  });
});

describe("rewriteLocation", () => {
  it("rewrites an absolute local-server URL back to the app origin", () => {
    expect(rewriteLocation("http://127.0.0.1:5173/project/my-repo", 5173)).toBe(
      `${APP_ORIGIN}/project/my-repo`,
    );
  });

  it("leaves relative locations unchanged", () => {
    expect(rewriteLocation("/project/my-repo", 5173)).toBe("/project/my-repo");
  });

  it("leaves external origins unchanged", () => {
    expect(rewriteLocation("https://example.com/page", 5173)).toBe("https://example.com/page");
  });

  it("leaves local-server URLs on a different port unchanged", () => {
    expect(rewriteLocation("http://127.0.0.1:9999/x", 5173)).toBe("http://127.0.0.1:9999/x");
  });
});

describe("rewriteRedirect", () => {
  it("returns the response unchanged when there is no location header", () => {
    const response = new Response("body", { status: 200 });
    expect(rewriteRedirect(response, 5173)).toBe(response);
  });

  it("rewrites a local-server location to the app origin, preserving status and other headers", () => {
    const response = new Response(null, {
      status: 302,
      statusText: "Found",
      headers: { location: "http://127.0.0.1:5173/project/my-repo", "set-cookie": "a=1" },
    });
    const rewritten = rewriteRedirect(response, 5173);
    expect(rewritten.status).toBe(302);
    expect(rewritten.statusText).toBe("Found");
    expect(rewritten.headers.get("location")).toBe(`${APP_ORIGIN}/project/my-repo`);
    expect(rewritten.headers.get("set-cookie")).toBe("a=1");
  });

  it("leaves an external location unchanged", () => {
    const response = new Response(null, {
      status: 302,
      headers: { location: "https://example.com/page" },
    });
    expect(rewriteRedirect(response, 5173).headers.get("location")).toBe("https://example.com/page");
  });
});

describe("appearance seeding", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      data,
    };
  }

  it("round-trips palette and mode from main-process args into empty renderer storage", () => {
    const storage = memoryStorage();
    seedAppearance(storage, ["electron", ...appearanceArgs("tokyo-night", "dark")]);
    expect(storage.data.get("palette")).toBe("tokyo-night");
    expect(storage.data.get("theme")).toBe("dark");
  });

  it("does not overwrite existing renderer storage", () => {
    const storage = memoryStorage({ palette: "nord", theme: "light" });
    seedAppearance(storage, [...appearanceArgs("dracula", "dark")]);
    expect(storage.data.get("palette")).toBe("nord");
    expect(storage.data.get("theme")).toBe("light");
  });

  it("ignores invalid or missing values", () => {
    const storage = memoryStorage();
    seedAppearance(storage, ["--context-launch-palette=bogus"]);
    expect(storage.data.has("palette")).toBe(false);
    expect(storage.data.has("theme")).toBe(false);
  });
});

describe("projectSlugFromUrl on app-origin URLs", () => {
  it("extracts the project slug from an app-origin project URL", () => {
    expect(projectSlugFromUrl(`${APP_ORIGIN}/project/my-repo`)).toBe("my-repo");
  });
});
