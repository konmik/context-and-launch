import { describe, it, expect } from "vitest";
import { createRoot, createSignal, type Accessor } from "solid-js";
import { createAgentLauncherController, type AgentLauncherController } from "./agent-launcher-controller.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";

function makeTicket(overrides: Partial<TicketInfo> & { folderName: string }): TicketInfo {
	return {
		number: overrides.number ?? "T-1",
		title: overrides.title ?? "Test ticket",
		status: overrides.status ?? "todo",
		contextNames: [],
		useWorktree: false,
		hasAgentWorktree: false,
		fileNames: [],
		references: [],
		...overrides,
	};
}

function makeConfig(editedPrompt: string | undefined): MergedLauncherConfig {
	return {
		templates: [{ name: "default", text: "generated", scope: "project" }],
		skills: [],
		profiles: [{ name: "agent", scope: "project" } as MergedLauncherConfig["profiles"][number]],
		shortcuts: [],
		columnDefaults: { todo: { templateName: null, profileName: null, checkedSkills: [], editedPrompt } },
		worktreeRootPath: null,
		conflictResolutionPrompt: "",
	};
}

function setup(initial: {
	ticket: TicketInfo;
	config: MergedLauncherConfig | null;
}): {
	ctrl: AgentLauncherController;
	setTicket: (t: TicketInfo) => void;
	setConfig: (c: MergedLauncherConfig) => void;
	dispose: () => void;
} {
	let out!: {
		ctrl: AgentLauncherController;
		setTicket: (t: TicketInfo) => void;
		setConfig: (c: MergedLauncherConfig) => void;
		dispose: () => void;
	};
	createRoot((dispose) => {
		const [ticket, setTicket] = createSignal(initial.ticket);
		const [config, setConfig] = createSignal<MergedLauncherConfig | null>(initial.config);
		const ctrl = createAgentLauncherController({
			projectSlug: "p",
			ticket: ticket as Accessor<TicketInfo>,
			get config() { return config(); },
			onDefaultsChange: () => {},
			useWorktree: false,
			projectPath: "/project",
			worktreeDir: "/work",
			launchDir: () => "/project",
			launch: async () => ({ ok: true }),
		});
		out = { ctrl, setTicket, setConfig, dispose };
	});
	return out;
}

describe("createAgentLauncherController prompt reset", () => {
	it("keeps in-progress prompt edits when config revalidates for the same ticket", () => {
		const { ctrl, setConfig, dispose } = setup({
			ticket: makeTicket({ folderName: "t-1-alpha", status: "todo" }),
			config: makeConfig("hello"),
		});

		ctrl.preview.setEditMode(true);
		ctrl.preview.setEditedPrompt("hello world");
		expect(ctrl.preview.currentPrompt()).toBe("hello world");

		setConfig(makeConfig("hello"));

		expect(ctrl.preview.currentPrompt()).toBe("hello world");

		dispose();
	});

	it("restores the saved edited prompt when the config arrives after the controller is created", () => {
		const { ctrl, setConfig, dispose } = setup({
			ticket: makeTicket({ folderName: "t-1-alpha", status: "todo" }),
			config: null,
		});

		expect(ctrl.preview.editMode()).toBe(false);

		setConfig(makeConfig("saved edit"));

		expect(ctrl.preview.editMode()).toBe(true);
		expect(ctrl.preview.currentPrompt()).toBe("saved edit");

		dispose();
	});

	it("stays on the generated prompt when the late-arriving config has no saved edit", () => {
		const { ctrl, setConfig, dispose } = setup({
			ticket: makeTicket({ folderName: "t-1-alpha", status: "todo" }),
			config: null,
		});

		setConfig(makeConfig(undefined));

		expect(ctrl.preview.editMode()).toBe(false);

		dispose();
	});

	it("resets the prompt to the saved value when the ticket identity changes", () => {
		const { ctrl, setTicket, setConfig, dispose } = setup({
			ticket: makeTicket({ folderName: "t-1-alpha", status: "todo" }),
			config: makeConfig(undefined),
		});

		ctrl.preview.setEditMode(true);
		ctrl.preview.setEditedPrompt("in progress on alpha");
		expect(ctrl.preview.currentPrompt()).toBe("in progress on alpha");

		setConfig(makeConfig("beta saved prompt"));
		setTicket(makeTicket({ folderName: "t-2-beta", status: "todo" }));

		expect(ctrl.preview.editMode()).toBe(true);
		expect(ctrl.preview.currentPrompt()).toBe("beta saved prompt");

		dispose();
	});
});
