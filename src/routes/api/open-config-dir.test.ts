import { describe, it, expect, vi } from "vitest";

vi.mock("~/server/config/instances.js", () => ({
	worktreeManager: { getWorktreeDir: vi.fn().mockReturnValue("/fake/worktree") },
	launcherConfigManager: {
		loadProjectConfig: vi.fn(),
		getProjectConfigDir: vi.fn().mockReturnValue("/fake/project-config"),
		getAppConfigDir: vi.fn().mockReturnValue("/fake/app-config"),
	},
}));

import { POST, openInOs, platformOpenCommand } from "~/routes/api/open-config-dir.js";

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

describe("open-config-dir platform branching", () => {
	it("darwin maps to 'open'", () => {
		setPlatform("darwin");
		try {
			expect(platformOpenCommand().cmd).toBe("open");
		} finally {
			restorePlatform();
		}
	});

	it("win32 maps to 'explorer.exe'", () => {
		setPlatform("win32");
		try {
			expect(platformOpenCommand().cmd).toBe("explorer.exe");
		} finally {
			restorePlatform();
		}
	});

	it("linux maps to 'xdg-open' (regression: original code wrongly used explorer.exe)", () => {
		setPlatform("linux");
		try {
			expect(platformOpenCommand().cmd).toBe("xdg-open");
			expect(platformOpenCommand().cmd).not.toBe("explorer.exe");
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
