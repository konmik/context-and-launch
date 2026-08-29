import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "valibot";

export const activeMarkerName = ".context-launch-test-workspace.json";
export const workspaceEnvironmentName = "CONTEXT_LAUNCH_TEST_WORKSPACE";
export const tokenEnvironmentName = "CONTEXT_LAUNCH_TEST_TOKEN";

const ActiveMarkerSchema = v.looseObject({
  managedBy: v.literal("context-launch-test-runner"),
  version: v.literal(1),
  kind: v.literal("active-workspace"),
  directory: v.string(),
  active: v.literal(true),
  token: v.pipe(v.string(), v.minLength(32)),
});

function git(sourcePath, args) {
  return execFileSync("git", ["-C", sourcePath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function canonicalPath(value) {
  const resolved = fs.realpathSync.native(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function getWorkspaceIdentity(sourceDirectory) {
  const sourcePath = canonicalPath(sourceDirectory);
  let sourceRef;
  try {
    sourceRef = git(sourcePath, ["symbolic-ref", "HEAD"]);
  } catch {
    sourceRef = `commit:${git(sourcePath, ["rev-parse", "HEAD"])}`;
  }
  return { sourcePath, sourceRef, workspaceKey: createWorkspaceKey(sourcePath, sourceRef) };
}

export function createWorkspaceKey(sourcePath, sourceRef) {
  const hash = createHash("sha256")
    .update(sourcePath)
    .update("\0")
    .update(sourceRef)
    .digest("hex");
  const sourceName = path.basename(sourcePath)
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!sourceName) throw new Error(`Cannot derive a workspace key from ${sourcePath}.`);
  return `${sourceName}-${hash.slice(0, 32)}`;
}

export function createActiveMarker(workspace, identity) {
  return {
    managedBy: "context-launch-test-runner",
    version: 1,
    kind: "active-workspace",
    directory: canonicalPath(workspace),
    workspaceKey: identity.workspaceKey,
    sourcePath: identity.sourcePath,
    sourceRef: identity.sourceRef,
    active: true,
    token: randomBytes(32).toString("hex"),
  };
}

export function readActiveMarker(workspace) {
  const markerPath = path.join(workspace, activeMarkerName);
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read the active test workspace marker at ${markerPath}: ${error.message}`);
  }
  const parsed = v.safeParse(ActiveMarkerSchema, marker);
  if (!parsed.success
    || canonicalPath(workspace) !== canonicalPath(parsed.output.directory)) {
    throw new Error(`The active test workspace marker at ${markerPath} is invalid.`);
  }
  return parsed.output;
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  if (process.argv[2] !== "identity" || !process.argv[3]) {
    throw new Error("Usage: node scripts/test-workspace.mjs identity <source-directory>");
  }
  process.stdout.write(JSON.stringify(getWorkspaceIdentity(process.argv[3])));
}
