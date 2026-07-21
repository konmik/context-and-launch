import { createSignal, createMemo, onCleanup } from "solid-js";
import { interpolatePrompt } from "~/core/launcher/prompt-interpolation.js";
import type { MergedLauncherConfig } from "~/core/launcher/launcher-config.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

const PERSIST_DEBOUNCE_MS = 400;

export interface PromptPreviewDeps {
	selectedTemplate: () => string;
	checkedSkills: () => Set<string>;
	orderedSkills: () => { name: string; text: string }[];
	config: () => MergedLauncherConfig | null;
	/** Omitted for a project-level launch: ticket placeholders are then unavailable. */
	ticket?: () => TicketInfo;
	projectPath: () => string;
	worktreeDir: () => string;
	projectSlug: string;
	launchDir: () => string;
	initialEditedPrompt: string | undefined;
	onEditedPromptChange: (editedPrompt: string | undefined) => void;
}

export function createPromptPreviewController(deps: PromptPreviewDeps) {
	const [editMode, setEditModeRaw] = createSignal(deps.initialEditedPrompt !== undefined);
	const [editedPrompt, setEditedPromptRaw] = createSignal(deps.initialEditedPrompt ?? "");

	let persistTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(persistTimer));
	function persist(value: string | undefined) {
		clearTimeout(persistTimer);
		persistTimer = setTimeout(() => deps.onEditedPromptChange(value), PERSIST_DEBOUNCE_MS);
	}

	const generatedPrompt = createMemo(() => {
		const cfg = deps.config();
		if (!cfg) return "";
		const templateName = deps.selectedTemplate();
		const templateText = cfg.templates.find(t => t.name === templateName)?.text ?? "";
		const checked = deps.checkedSkills();
		const skillTexts = deps.orderedSkills()
			.filter(s => checked.has(s.name))
			.map(s => s.text);
		const variables: Record<string, string> = {
			projectPath: deps.projectPath(),
			projectSlug: deps.projectSlug,
			skills: skillTexts.join('\n'),
			launchDir: deps.launchDir(),
		};
		const t = deps.ticket?.();
		if (t) {
			const ticketDir = deps.worktreeDir().replace(/[\\/]$/, '') + "/" + t.folderName;
			variables.ticketDir = ticketDir;
			variables.ticketSlug = t.folderName;
			variables.ticketTitle = t.title;
			variables.ticketNumber = t.number;
			variables.ticketStatus = t.status;
		}
		return interpolatePrompt(templateText, variables);
	});

	const currentPrompt = createMemo(() =>
		editMode() ? editedPrompt() : generatedPrompt(),
	);

	function setEditedPrompt(value: string) {
		setEditedPromptRaw(value);
		if (editMode()) persist(value);
	}

	function setEditMode(on: boolean) {
		if (on) {
			const generated = generatedPrompt();
			setEditedPromptRaw(generated);
			persist(generated);
		} else {
			setEditedPromptRaw("");
			persist(undefined);
		}
		setEditModeRaw(on);
	}

	function resetFromSaved(saved: string | undefined) {
		clearTimeout(persistTimer);
		setEditModeRaw(saved !== undefined);
		setEditedPromptRaw(saved ?? "");
	}

	return {
		editMode,
		setEditMode,
		editedPrompt,
		setEditedPrompt,
		currentPrompt,
		resetFromSaved,
	};
}

export type PromptPreviewController = ReturnType<typeof createPromptPreviewController>;
