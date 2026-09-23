import { Show, createSignal, createEffect } from "solid-js";
import { X } from "~/components/ui/icons.js";
import {
	FloatingWindow, FloatingWindowHeader, FloatingPanelBody,
	FloatingPanelCloseTrigger, FloatingPanelTitle,
} from "../ui/floating-panel";
import { TabsRoot, TabsList, TabsTrigger } from "../ui/tabs";
import { openConfigDir } from "../shared/shared-api.js";
import { MiscTab } from "./launcher-settings-misc-tab.js";
import { PromptsTab } from "./launcher-settings-prompts-tab.js";
import { LaunchTab } from "./launcher-settings-launch-tab.js";
import { ColumnsTab } from "./launcher-settings-columns-tab.js";
import { CommandTemplatesTab } from './launcher-settings-command-templates-tab.js';

interface LauncherSettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectSlug: string;
	onDeleteProject?: (projectSlug: string) => Promise<{ error?: string }>;
}

export default function LauncherSettings(props: LauncherSettingsProps) {
	const [activeTab, setActiveTab] = createSignal('profiles');

	const [visitedTabs, setVisitedTabs] = createSignal<Set<string>>(new Set());
	createEffect(activeTab, (tab) => {
		setVisitedTabs((prev) => prev.has(tab) ? prev : new Set(prev).add(tab));
	});
	const visited = (tab: string) => visitedTabs().has(tab);

	const defaultSize = {
		width: 672,
		height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8),
	};

	return (<>
		<FloatingWindow
			open={props.open}
			onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}
			defaultSize={defaultSize}
			minSize={{ width: 400, height: 300 }}
			persistRect
		>
		<TabsRoot value={activeTab()} onValueChange={(d) => setActiveTab(d.value)}>
			<FloatingWindowHeader
				title={<FloatingPanelTitle>Settings</FloatingPanelTitle>}
				actions={<>
					<button
						data-testid="launcher-settings-open-user-config"
						onClick={() => openConfigDir("app")}
						class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
						title="Open user config directory"
					>User&#8599;</button>
					<button
						data-testid="launcher-settings-open-project-config"
						onClick={() => openConfigDir("project", props.projectSlug)}
						class="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
						title="Open project config directory"
					>Project&#8599;</button>
					<FloatingPanelCloseTrigger data-testid="launcher-settings-close-button">
						<X size={16} />
					</FloatingPanelCloseTrigger>
				</>}
			>
				<div class="-mx-4 -mb-4">
					<TabsList>
						<TabsTrigger
							value="profiles"
							data-testid="launcher-settings-tab-launch"
						>Launch</TabsTrigger>
						<TabsTrigger
							value="templates"
							data-testid="launcher-settings-tab-prompts"
						>Prompt Templates</TabsTrigger>
						<TabsTrigger
							value="command-templates"
							data-testid="launcher-settings-tab-command-templates"
						>Command Templates</TabsTrigger>
						<TabsTrigger
							value="misc"
							data-testid="launcher-settings-tab-misc"
						>Misc</TabsTrigger>
						<TabsTrigger
							value="columns"
							data-testid="launcher-settings-tab-columns"
						>Columns</TabsTrigger>
					</TabsList>
				</div>
			</FloatingWindowHeader>

			<FloatingPanelBody>
				<div class="flex-1 overflow-auto px-6 py-4" data-testid="launcher-settings-scroll">
					<Show when={visited('misc')}>
						<MiscTab open={props.open} projectSlug={props.projectSlug}
							onDeleteProject={props.onDeleteProject} />
					</Show>
					<Show when={visited('templates')}><PromptsTab open={props.open} /></Show>
					<Show when={visited('profiles')}><LaunchTab open={props.open} /></Show>
					<Show when={visited('columns')}>
						<ColumnsTab open={props.open} projectSlug={props.projectSlug} />
					</Show>
					<Show when={visited('command-templates')}><CommandTemplatesTab /></Show>
				</div>
			</FloatingPanelBody>
		</TabsRoot>
		</FloatingWindow>
	</>);
}
