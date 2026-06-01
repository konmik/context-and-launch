import os from "os";
import { EventEmitter } from "events";
import { describe, it, expect, vi } from "vitest";

// Mock child_process so platform branching can be asserted against the exact
// (cmd, args, options) openInOs passes. The default implementation delegates to
// the real spawn, so the real-spawn regression tests below are unaffected;
// branching tests override a single call with mockImplementationOnce.
// child_process is CJS, so `import { spawn }` resolves through `default.spawn`
// under interop -- the override must replace both the named and default export.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
	const actual = await importOriginal<typeof import("child_process")>();
	spawnMock.mockImplementation(actual.spawn);
	return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock };
});

// Records the args of the next spawn and emits "spawn" so openInOs resolves
// without launching anything.
function captureSpawn() {
	const calls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = [];
	spawnMock.mockImplementationOnce((cmd: string, args: string[], opts: Record<string, unknown>) => {
		calls.push({ cmd, args, opts });
		const child = new EventEmitter() as EventEmitter & { unref: () => void };
		child.unref = () => {};
		queueMicrotask(() => child.emit("spawn"));
		return child;
	});
	return calls;
}

// A real directory that exists on every host so tests that target the spawn
// behavior (not the existsSync gate) can run past the pre-check. Individual
// tests override these mocks to point at non-existent paths when the missing-
// dir branch is the subject under test.
const realDir = os.tmpdir();

vi.mock("~/server/config/instances.js", () => ({
	worktreeManager: { getWorktreeDir: vi.fn().mockReturnValue("/fake/worktree") },
	launcherConfigManager: {
		loadProjectConfig: vi.fn(),
		getAppConfigDir: vi.fn().mockReturnValue("/fake/app-config"),
	},
	projectRegistry: {
		getProjectDir: vi.fn().mockReturnValue("/fake/project-dir"),
	},
}));

import { launcherConfigManager } from "~/server/config/instances.js";

import { openInOs } from "~/server/infra/open-in-os.js";
import { POST } from "~/routes/api/open-config-dir.js";

function fakeEvent(body: Record<string, unknown>) {
	return {
		params: {},
		request: new Request("http://localhost/api/open-config-dir", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	} as unknown as Parameters<typeof POST>[0];
}

const originalPlatform = process.platform;
function setPlatform(p: NodeJS.Platform): void {
	Object.defineProperty(process, "platform", { value: p, configurable: true });
}
function restorePlatform(): void {
	Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
}

describe("openInOs platform branching", () => {
	it("darwin spawns 'open', not detached", async () => {
		setPlatform("darwin");
		const calls = captureSpawn();
		try {
			await openInOs("/some/dir");
			expect(calls[0].cmd).toBe("open");
			expect(calls[0].args).toEqual(["/some/dir"]);
			expect(calls[0].opts.detached).toBe(false);
		} finally {
			restorePlatform();
		}
	});

	it("win32 spawns 'explorer.exe' detached (for foreground activation)", async () => {
		setPlatform("win32");
		const calls = captureSpawn();
		try {
			await openInOs("C:/some/dir");
			expect(calls[0].cmd).toBe("explorer.exe");
			expect(calls[0].args).toEqual(["C:/some/dir"]);
			expect(calls[0].opts.detached).toBe(true);
		} finally {
			restorePlatform();
		}
	});

	it("linux spawns 'xdg-open' (regression: original code wrongly used explorer.exe), not detached", async () => {
		setPlatform("linux");
		const calls = captureSpawn();
		try {
			await openInOs("/some/dir");
			expect(calls[0].cmd).toBe("xdg-open");
			expect(calls[0].cmd).not.toBe("explorer.exe");
			expect(calls[0].opts.detached).toBe(false);
		} finally {
			restorePlatform();
		}
	});
});

describe("openInOs surfaces spawn errors (regression: original swallowed ENOENT)", () => {
	it("rejects when the platform command is missing on the host", async () => {
		// Force linux on a macOS host where xdg-open is not installed. spawn raises
		// ENOENT; the fix attaches an "error" listener so the promise rejects.
		// The original code did spawn().unref() with no listener and unconditionally
		// returned 200, silently no-opping for the user.
		setPlatform("linux");
		try {
			await expect(openInOs("/tmp/anything")).rejects.toThrow(/Failed to open/);
		} finally {
			restorePlatform();
		}
	});

	it("POST returns 500 with error body when the underlying open command fails", async () => {
		setPlatform("linux");
		vi.mocked(launcherConfigManager.getAppConfigDir).mockReturnValueOnce(realDir);
		try {
			const response = await POST(fakeEvent({ scope: "app" }));
			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error).toMatch(/Failed to open/);
		} finally {
			restorePlatform();
		}
	});
});

describe("POST guards against missing target directory (regression: spawn fired before exit, returned 200)", () => {
	it("returns 404 when the resolved app-config dir does not exist on disk", async () => {
		// On the dev host `open` IS installed, so the spawn event fires successfully
		// and the original code resolved with 200 even though `/fake/app-config`
		// does not exist. The fix pre-checks fs.existsSync and returns 404.
		setPlatform("darwin");
		try {
			const response = await POST(fakeEvent({ scope: "app" }));
			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body.error).toMatch(/does not exist|not found/i);
		} finally {
			restorePlatform();
		}
	});

	it("returns 404 when the resolved project-config dir does not exist on disk", async () => {
		setPlatform("darwin");
		try {
			const response = await POST(fakeEvent({ scope: "project", projectSlug: "proj" }));
			expect(response.status).toBe(404);
		} finally {
			restorePlatform();
		}
	});
});
