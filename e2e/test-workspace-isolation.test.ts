import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	activeMarkerName,
	createActiveMarker,
	createWorkspaceKey,
	getWorkspaceIdentity,
} from "../scripts/test-workspace.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guardPath = path.join(repoRoot, "scripts", "require-test-workspace.mjs");

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});

function guardEnvironment(workspace?: string, token?: string): NodeJS.ProcessEnv {
	const env = { ...process.env };
	delete env.CONTEXT_LAUNCH_TEST_WORKSPACE;
	delete env.CONTEXT_LAUNCH_TEST_TOKEN;
	if (workspace) env.CONTEXT_LAUNCH_TEST_WORKSPACE = workspace;
	if (token) env.CONTEXT_LAUNCH_TEST_TOKEN = token;
	return env;
}

function managedWorkspace() {
	const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "context-launch-guard-"));
	temporaryDirectories.push(workspace);
	const marker = createActiveMarker(workspace, getWorkspaceIdentity(repoRoot));
	fs.writeFileSync(path.join(workspace, activeMarkerName), JSON.stringify(marker));
	return { workspace, marker };
}

function runGuard(workspace?: string, token?: string) {
	return spawnSync(process.execPath, [guardPath], {
		cwd: workspace ?? repoRoot,
		env: guardEnvironment(workspace, token),
		encoding: "utf8",
	});
}

describe("test workspace isolation", () => {
	it("keys workspaces by the complete source path and ref", () => {
		const key = createWorkspaceKey("/one/project", "refs/heads/feature/one");

		expect(createWorkspaceKey("/two/project", "refs/heads/feature/one")).not.toBe(key);
		expect(createWorkspaceKey("/one/project", "refs/heads/feature/two")).not.toBe(key);
	});

	it("rejects internal test commands in the source workspace", () => {
		const result = runGuard();

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Run the public npm test command instead");
	});

	it("accepts the managed isolated workspace", () => {
		const { workspace, marker } = managedWorkspace();
		const result = runGuard(workspace, marker.token);

		expect(result.status, result.stderr).toBe(0);
	});

	it("rejects a workspace without the active token", () => {
		const { workspace } = managedWorkspace();
		const result = runGuard(workspace);

		expect(result.status).toBe(1);
	});

	it("rejects a token that does not own the active workspace", () => {
		const { workspace } = managedWorkspace();
		const result = runGuard(workspace, "a".repeat(64));

		expect(result.status).toBe(1);
	});

	it("rejects an inactive ownership marker", () => {
		const { workspace, marker } = managedWorkspace();
		fs.writeFileSync(
			path.join(workspace, activeMarkerName),
			JSON.stringify({ ...marker, active: false }),
		);
		const result = runGuard(workspace, marker.token);

		expect(result.status).toBe(1);
	});
});
