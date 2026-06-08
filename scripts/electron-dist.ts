import fs from "fs";
import { execSync } from "child_process";

const DIST_DIR = "dist-electron";

const CLEANUP_PATTERNS = [
  /-unpacked$/,
  /^mac$/,
  /^mac-arm64$/,
  /^mac-universal$/,
  /\.blockmap$/,
  /^builder-debug\.yml$/,
  /^builder-effective-config\.yaml$/,
];

fs.rmSync(DIST_DIR, { recursive: true, force: true });

const steps = [
  "vinxi build",
  "npm run electron:build-main",
  "npx electron-builder",
];
for (const cmd of steps) {
  execSync(cmd, { stdio: "inherit" });
}

for (const entry of fs.readdirSync(DIST_DIR)) {
  if (CLEANUP_PATTERNS.some((p) => p.test(entry))) {
    fs.rmSync(`${DIST_DIR}/${entry}`, { recursive: true, force: true });
  }
}
