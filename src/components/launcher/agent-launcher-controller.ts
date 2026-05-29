import { createSignal, createEffect, createMemo, on } from "solid-js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";
import type { MergedLauncherConfig, LauncherColumnDefaults } from "~/server/launcher/launcher-config.js";
import type { ErrorInfo } from "~/server/shared/errors.js";
import { createListReorder, orderByNameList } from "../board/list-reorder.js";
import {
	resolveDefaults, buildLaunchBody, ticketAiUrl,
	parseLaunchResponse, textToErrorInfo,
} from "./agent-launcher-pure.js";

type MergedSkill = MergedLauncherConfig["skills"][number];

export interface AgentLauncherDeps {
	projectSlug: string;
	ticket: TicketInfo;
	config: MergedLauncherConfig | null;
	onDefaultsChange: (patch: Partial<LauncherColumnDefaults>) => void;
	useWorktree: boolean;
}

export function createAgentLauncherController(props: AgentLauncherDeps) {
	const initial = resolveDefaults(props.config, props.ticket.status);
	const [selectedTemplate, setSelectedTemplate] = createSignal(initial.templateName);
	const [selectedProfile, setSelectedProfile] = createSignal(initial.profileName);
	const [checkedSkills, setCheckedSkills] = createSignal<Set<string>>(new Set(initial.checkedSkills));
	const [skillOrder, setSkillOrder] = createSignal<string[]>(initial.skillOrder);
	const [launching, setLaunching] = createSignal(false);
	const [errorInfo, setErrorInfo] = createSignal<ErrorInfo | null>(null);
	const [behindRemoteMsg, setBehindRemoteMsg] = createSignal("");
	const [dirtyWorktreeMsg, setDirtyWorktreeMsg] = createSignal("");

	createEffect(on(
		() => [props.config, props.ticket.folderName] as const,
		([cfg]) => {
			const defaults = resolveDefaults(cfg, props.ticket.status);
			setSelectedTemplate(defaults.templateName);
			setSelectedProfile(defaults.profileName);
			setCheckedSkills(new Set(defaults.checkedSkills));
			setSkillOrder(defaults.skillOrder);
		},
		{ defer: true },
	));

	const orderedSkills = createMemo(() =>
		orderByNameList(props.config?.skills ?? [], skillOrder()),
	);

	function toggleSkill(name: string) {
		const next = new Set(checkedSkills());
		if (next.has(name)) next.delete(name);
		else next.add(name);
		setCheckedSkills(next);
		props.onDefaultsChange({ checkedSkills: [...next] });
	}

	const skillReorder = createListReorder<MergedSkill>({
		items: orderedSkills,
		idOf: (s) => s.name,
		onReorder: (orderedNames) => {
			setSkillOrder(orderedNames);
			props.onDefaultsChange({ skillOrder: orderedNames });
		},
	});

	async function launchAgent(extra?: Record<string, unknown>) {
		setLaunching(true);
		setErrorInfo(null);
		setBehindRemoteMsg("");
		setDirtyWorktreeMsg("");
		try {
			const url = ticketAiUrl(props.projectSlug, props.ticket.folderName, "run");
			const body = buildLaunchBody(
				selectedTemplate(), [...checkedSkills()], props.useWorktree, selectedProfile(), extra,
			);
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (res.ok) return;
			const result = parseLaunchResponse(res.status, await res.text());
			switch (result.type) {
				case "behindRemote": setBehindRemoteMsg(result.message); break;
				case "dirtyWorktree": setDirtyWorktreeMsg(result.message); break;
				case "error": setErrorInfo(result.errorInfo); break;
			}
		} catch (e: unknown) {
			setErrorInfo({ description: e instanceof Error ? e.message : "Network error" });
		} finally {
			setLaunching(false);
		}
	}

	async function pullAndRetry() {
		setLaunching(true);
		setBehindRemoteMsg("");
		setErrorInfo(null);
		try {
			const url = ticketAiUrl(props.projectSlug, props.ticket.folderName, "pull-and-retry");
			const body = buildLaunchBody(
				selectedTemplate(), [...checkedSkills()], props.useWorktree, selectedProfile(),
			);
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) setErrorInfo(textToErrorInfo(await res.text(), res.status));
		} catch (e: unknown) {
			setErrorInfo({ description: e instanceof Error ? e.message : "Network error" });
		} finally {
			setLaunching(false);
		}
	}

	return {
		selectedTemplate, selectedProfile, checkedSkills,
		orderedSkills, launching, errorInfo, behindRemoteMsg, dirtyWorktreeMsg,
		setSelectedTemplate, setSelectedProfile,
		setErrorInfo, setBehindRemoteMsg, setDirtyWorktreeMsg,
		toggleSkill, skillReorder, launchAgent, pullAndRetry,
	};
}

export type AgentLauncherController = ReturnType<typeof createAgentLauncherController>;
