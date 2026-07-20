import fs from "fs";
import { runDetachedProcess } from "./platform-shell-runner.test-utils.js";

const pidFile = process.argv[2];
const mode = process.argv[3] ?? "idle";
const doneFile = process.argv[4];
if (!pidFile) throw new Error("pidFile argument is required");
const idleScript =
  "require('fs').writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 30000);";
const writingScript = [
  "const fs = require('fs');",
  "fs.writeFileSync(process.argv[1], String(process.pid));",
  "let n = 0;",
  "const t = setInterval(() => {",
  "  console.log('tick ' + n);",
  "  console.error('tock ' + n);",
  "  n++;",
  "  if (n >= 20) { clearInterval(t); fs.writeFileSync(process.argv[2], 'done'); }",
  "}, 100);",
].join("\n");
const detachDelayMs = 100;

if (mode === "powershell-grandchild") {
  const psCommand =
    `$p = Start-Process -FilePath '${process.execPath}' ` +
    "-ArgumentList '-e','setTimeout(function(){},30000)' -PassThru; " +
    `Set-Content -LiteralPath '${pidFile}' -Value $p.Id`;
  await runDetachedProcess("powershell", ["-NoProfile", "-Command", psCommand], process.cwd(), detachDelayMs);
  const deadline = Date.now() + 15000;
  while (!fs.existsSync(pidFile)) {
    if (Date.now() > deadline) throw new Error("powershell never wrote the grandchild pid file");
    await new Promise(r => setTimeout(r, 50));
  }
} else if (mode === "writing") {
  if (!doneFile) throw new Error("doneFile argument is required for writing mode");
  await runDetachedProcess(process.execPath, ["-e", writingScript, pidFile, doneFile], process.cwd(), detachDelayMs);
} else {
  await runDetachedProcess(process.execPath, ["-e", idleScript, pidFile], process.cwd(), detachDelayMs);
}
process.exit(0);
