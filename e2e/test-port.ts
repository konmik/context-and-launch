import { execSync } from "node:child_process";

const SCRIPT = [
  "const s = require('net').createServer();",
  "s.listen(0, () => {",
  "  process.stdout.write(String(s.address().port));",
  "  s.close();",
  "});",
].join("");

export function pickPort(): number {
  const out = execSync(`${process.execPath} -e "${SCRIPT}"`, { encoding: "utf-8" });
  const port = parseInt(out.trim(), 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`pickPort: unexpected output: ${out}`);
  }
  return port;
}
