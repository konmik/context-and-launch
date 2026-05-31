import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickPort } from "./test-port.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ENTRY = path.join(PROJECT_ROOT, ".output", "server", "index.mjs");

export interface RealServer {
  process: ChildProcess;
  baseUrl: string;
}

async function startRealServerOnce(
  port: number,
  dataDir: string,
  extraEnv: NodeJS.ProcessEnv,
): Promise<RealServer | { addrInUse: true; stderr: string }> {
  const baseUrl = `http://localhost:${port}`;
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(port),
      CONTEXT_LAUNCH_DATA_DIR: dataDir,
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  proc.stderr?.on("data", (b: Buffer) => { stderr += b.toString(); });

  const deadline = Date.now() + 20000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      if (stderr.includes("EADDRINUSE")) {
        return { addrInUse: true, stderr };
      }
      throw new Error(`Real server exited early (code ${proc.exitCode}):\n${stderr}`);
    }
    try {
      const res = await fetch(baseUrl);
      if (res.status < 500) return { process: proc, baseUrl };
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error(`Real server did not start at ${baseUrl} within 20s: ${String(lastErr)}\n${stderr}`);
}

export async function startRealServer(
  port: number,
  dataDir: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<RealServer> {
  const maxAttempts = 5;
  let currentPort = port;
  let lastStderr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await startRealServerOnce(currentPort, dataDir, extraEnv);
    if (!("addrInUse" in res)) return res;
    lastStderr = res.stderr;
    currentPort = pickPort();
  }
  throw new Error(
    `Real server could not bind a port after ${maxAttempts} attempts. Last stderr:\n${lastStderr}`,
  );
}

export function stopRealServer(server: RealServer): Promise<void> {
  return new Promise((resolve) => {
    if (server.process.exitCode !== null) {
      resolve();
      return;
    }
    server.process.once("exit", () => resolve());
    server.process.kill();
    setTimeout(resolve, 3000);
  });
}
