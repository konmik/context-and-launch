import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBuiltAppHandler } from "../scripts/built-app.mjs";

const roots: string[] = [];

async function fixture() {
  const clientRoot = await mkdtemp(path.join(os.tmpdir(), "context-launch-built-app-"));
  roots.push(clientRoot);
  await mkdir(path.join(clientRoot, "assets"));
  await writeFile(path.join(clientRoot, "index.html"), "<main>shell</main>");
  await writeFile(path.join(clientRoot, "assets", "app.js"), "export {};");
  const fetch = vi.fn(async () => new Response("server"));
  return { clientRoot, fetch, handleRequest: createBuiltAppHandler({ fetch }, clientRoot) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("built application handler", () => {
  it("serves assets and HEAD responses without dispatching to the server", async () => {
    const { fetch, handleRequest } = await fixture();
    const get = await handleRequest(new Request("http://app/assets/app.js"));
    const head = await handleRequest(new Request("http://app/assets/app.js", { method: "HEAD" }));
    expect(await get.text()).toBe("export {};");
    expect(get.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await head.text()).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the static shell as the browser and Electron history fallback", async () => {
    const { handleRequest } = await fixture();
    const response = await handleRequest(new Request("app://context-launch/project/example?tab=forest"));
    expect(await response.text()).toBe("<main>shell</main>");
  });

  it.each(["/_server/read", "/api/projects/example/board/tickets/ST-1/references/content?path=a.md"])(
    "dispatches %s to the built server",
    async (pathname) => {
      const { fetch, handleRequest } = await fixture();
      const request = new Request(`app://context-launch${pathname}`);
      expect(await (await handleRequest(request)).text()).toBe("server");
      expect(fetch).toHaveBeenCalledWith(request);
    },
  );

  it("rejects traversal and malformed encoded paths", async () => {
    const { handleRequest } = await fixture();
    expect((await handleRequest(new Request("http://app/%2e%2e%2fsecret"))).status).toBe(404);
    expect((await handleRequest(new Request("http://app/%E0%A4%A"))).status).toBe(400);
  });
});
