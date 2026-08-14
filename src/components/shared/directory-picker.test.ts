import { afterEach, describe, expect, it, vi } from "vitest";
import { pickDirectory } from "./directory-picker.js";

afterEach(() => {
	delete window.contextLaunch;
});

describe("pickDirectory", () => {
	it("uses Electron's native directory picker when the desktop bridge is available", async () => {
		const nativePicker = vi.fn().mockResolvedValue({ path: "C:\\worktrees" });
		window.contextLaunch = {
			setPalette: vi.fn(),
			setMode: vi.fn(),
			pickDirectory: nativePicker,
		};

		await expect(pickDirectory("C:\\projects")).resolves.toEqual({ path: "C:\\worktrees" });
		expect(nativePicker).toHaveBeenCalledWith("C:\\projects");
	});
});
