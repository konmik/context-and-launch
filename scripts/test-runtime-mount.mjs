import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const candidateDriveLetters = ["Z", "Y", "X", "W", "V", "U"];
const mountLinePattern = /^([A-Za-z]:)\\:\s+=>\s+(\S.*?)\s*$/;

export function parseMountTable(substOutput) {
  return substOutput
    .split(/\r?\n/)
    .map((line) => mountLinePattern.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ drive: match[1].toUpperCase(), target: match[2] }));
}

function isSamePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

export function planRuntimeMount(mounts, directory, directoryExists) {
  const release = mounts
    .filter((mount) => isSamePath(mount.target, directory) || !directoryExists(mount.target))
    .map((mount) => mount.drive);
  for (const letter of candidateDriveLetters) {
    const drive = `${letter}:`;
    if (release.includes(drive)) {
      return { drive, release };
    }
    if (mounts.some((mount) => mount.drive === drive)) {
      continue;
    }
    if (directoryExists(`${drive}\\`)) {
      continue;
    }
    return { drive, release };
  }
  throw new Error(
    `No drive letter from ${candidateDriveLetters.at(-1)}: through ${candidateDriveLetters[0]}: `
    + "is available for the isolated test runtime.",
  );
}

function subst(args) {
  const result = spawnSync("subst.exe", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`subst.exe ${args.join(" ")} failed with exit code ${result.status}: ${details}`);
  }
  return result.stdout;
}

function directoryExists(candidate) {
  return fs.existsSync(candidate);
}

export function readMountTable() {
  return parseMountTable(subst([]));
}

export function mountRuntime(directory) {
  const plan = planRuntimeMount(readMountTable(), directory, directoryExists);
  for (const drive of plan.release) {
    unmountRuntime(drive);
  }
  subst([plan.drive, path.resolve(directory)]);
  return plan.drive;
}

export function unmountRuntime(drive) {
  subst([drive, "/D"]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , command, argument] = process.argv;
  if (command === "mount" && argument) {
    process.stdout.write(mountRuntime(argument));
  } else if (command === "unmount" && argument) {
    unmountRuntime(argument);
  } else {
    throw new Error("Usage: node scripts/test-runtime-mount.mjs <mount <directory>|unmount <drive>>");
  }
}
