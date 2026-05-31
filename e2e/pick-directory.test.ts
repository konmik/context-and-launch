import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pickPort } from "./test-port.js";
import { startRealServer, stopRealServer, type RealServer } from "./real-server.js";

const PORT = pickPort();

let server: RealServer;
let dataDir: string;
let binDir: string;

const FAKE_PICKED = "/fake/picked/from/stub";
const PICKER_NAME = process.platform === "darwin" ? "osascript" : "zenity";

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writePicker(stdout: string, stderr: string, exitCode: number): void {
  const p = path.join(binDir, PICKER_NAME);
  fs.writeFileSync(
    p,
    `#!/bin/sh\nprintf '%s' "${stdout}"\nprintf '%s' "${stderr}" >&2\nexit ${exitCode}\n`,
  );
  fs.chmodSync(p, 0o755);
}

describe("/api/pick-directory (sandboxed e2e)", () => {
  beforeAll(async () => {
    dataDir = tmpDir("cl-pick-data-");
    binDir = tmpDir("cl-pick-bin-");

    const env: Record<string, string> = {};

    if (process.platform === "win32") {
      env.CONTEXT_PICKER_STUB = FAKE_PICKED;
    } else {
      env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    }

    server = await startRealServer(PORT, dataDir, env);
  }, 60000);

  afterAll(async () => {
    if (server) await stopRealServer(server);
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    if (binDir) fs.rmSync(binDir, { recursive: true, force: true });
  }, 20000);

  beforeEach(() => {
    if (process.platform === "win32") return;
    writePicker(FAKE_PICKED, "", 0);
  });

  it("invokes the platform's native folder picker and returns the chosen path", async () => {
    const res = await fetch(`${server.baseUrl}/api/pick-directory?path=/some/start`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe(FAKE_PICKED);
  }, 30000);

  it("returns 204 with empty body when the user cancels", async () => {
    if (process.platform === "win32") return;
    const cancelStderr = process.platform === "darwin"
      ? "47:62: execution error: User canceled. (-128)"
      : "";
    writePicker("", cancelStderr, 1);
    const res = await fetch(`${server.baseUrl}/api/pick-directory`);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  }, 30000);

  it("returns 500 with error message when the picker fails (not cancel)", async () => {
    if (process.platform === "win32") return;
    writePicker("", "some unexpected picker failure", 2);
    const res = await fetch(`${server.baseUrl}/api/pick-directory`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("some unexpected picker failure");
  }, 30000);
});
