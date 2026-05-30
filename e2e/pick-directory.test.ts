import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFakePicker(name: string, output: string): void {
  const p = path.join(binDir, name);
  fs.writeFileSync(p, `#!/bin/sh\nprintf '%s\\n' "${output}"\n`);
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
      if (process.platform === "darwin") {
        writeFakePicker("osascript", FAKE_PICKED);
      } else {
        writeFakePicker("zenity", FAKE_PICKED);
      }
      env.PATH = `${binDir}${path.delimiter}${process.env.PATH ?? ""}`;
    }

    server = await startRealServer(PORT, dataDir, env);
  }, 60000);

  afterAll(async () => {
    if (server) await stopRealServer(server);
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
    if (binDir) fs.rmSync(binDir, { recursive: true, force: true });
  }, 20000);

  it("invokes the platform's native folder picker and returns the chosen path", async () => {
    const res = await fetch(`${server.baseUrl}/api/pick-directory?path=/some/start`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe(FAKE_PICKED);
  }, 30000);
});
