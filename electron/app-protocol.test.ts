import { describe, it, expect } from "vitest";
import {
  APP_ORIGIN,
  APP_HOST,
  APP_SCHEME,
  handleAppRequest,
  appearanceArgs,
  seedAppearance,
  type AppRequestHandler,
} from "./app-protocol.js";
import { projectSlugFromUrl } from "./window-bookkeeping.js";

interface Recorded {
  request: Request;
}

function recordingBackend(response: Response = new Response("ok")): {
  handleRequest: AppRequestHandler;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const handleRequest: AppRequestHandler = (request) => {
    calls.push({ request });
    return Promise.resolve(response);
  };
  return { handleRequest, calls };
}

function streamingRequest(url: string, chunks: string[]): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    duplex: "half",
  } as RequestInit);
}

describe("handleAppRequest", () => {
  it("routes an app-origin URL to the in-process handler by path and query", async () => {
    const { handleRequest, calls } = recordingBackend();
    await handleAppRequest(new Request(`${APP_ORIGIN}/project/my-repo?x=1`), handleRequest);
    expect(calls[0].request.url).toBe(`${APP_ORIGIN}/project/my-repo?x=1`);
    expect(calls[0].request.method).toBe("GET");
  });

  it("buffers a streaming request body instead of forwarding the stream", async () => {
    const { handleRequest, calls } = recordingBackend();
    await handleAppRequest(
      streamingRequest(`${APP_ORIGIN}/_server/saveTicket`, ['{"a":', "1}"]),
      handleRequest,
    );
    expect(await calls[0].request.text()).toBe('{"a":1}');
  });

  it("forwards request headers unchanged", async () => {
    const { handleRequest, calls } = recordingBackend();
    await handleAppRequest(
      new Request(`${APP_ORIGIN}/_server/x`, {
        method: "GET",
        headers: { accept: "text/html", referer: `${APP_ORIGIN}/project/x` },
      }),
      handleRequest,
    );
    expect(calls[0].request.headers.get("accept")).toBe("text/html");
    expect(calls[0].request.headers.get("referer")).toBe(`${APP_ORIGIN}/project/x`);
  });

  it("omits the body for a bodyless request", async () => {
    const { handleRequest, calls } = recordingBackend();
    await handleAppRequest(new Request(`${APP_ORIGIN}/`), handleRequest);
    expect(calls[0].request.body).toBeNull();
  });

  it("returns the handler response unchanged", async () => {
    const response = new Response("payload", { status: 201, headers: { "x-test": "1" } });
    const { handleRequest } = recordingBackend(response);
    const result = await handleAppRequest(new Request(`${APP_ORIGIN}/`), handleRequest);
    expect(result).toBe(response);
  });

  it("rejects a URL from a different origin", async () => {
    const { handleRequest } = recordingBackend();
    await expect(handleAppRequest(new Request("http://evil.example/steal"), handleRequest))
      .rejects.toThrow(/app-origin/);
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
