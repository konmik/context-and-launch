import type { CommandTemplateService } from "../command-template/command-template-service.js";
import type { LauncherConfigManager } from "../launcher/launcher-config.js";
import {
	agentMarkerPathIn, buildWindowTitle, isProfileAgentRunning, runLauncherProfile,
} from "../launcher/profile-launch.js";
import type { ResolvedDiffReviewTarget } from "./diff-review-target.js";

export interface ReviewAgentLauncher {
	isRunning(target: ResolvedDiffReviewTarget): boolean;
	launch(target: ResolvedDiffReviewTarget, initialPrompt: string): Promise<void>;
}

export class ProfileReviewAgentLauncher implements ReviewAgentLauncher {
	constructor(
		private readonly launcherConfig: LauncherConfigManager,
		private readonly commands: CommandTemplateService,
	) {}

	isRunning(target: ResolvedDiffReviewTarget): boolean {
		return isProfileAgentRunning(this.commands, this.markerPath(target));
	}

	async launch(target: ResolvedDiffReviewTarget, initialPrompt: string): Promise<void> {
		const merged = this.launcherConfig.getMergedConfig(target.projectSlug);
		const profileName = merged.columnDefaults[target.ticket.status]?.profileName;
		if (!profileName) {
			throw new Error(
				`No launcher profile is chosen for the '${target.ticket.status}' column.`
				+ " Start an Agent once from the Ticket so the Review Prompt Queue knows"
				+ " how to start one.",
			);
		}
		const profile = merged.profiles.find((candidate) => candidate.name === profileName);
		if (!profile?.command.trim()) {
			throw new Error(`Launcher profile '${profileName}' is missing or has no command.`);
		}
		await runLauncherProfile(this.commands, profile, {
			initialPrompt,
			windowTitle: buildWindowTitle(target.ticket),
			markerPath: this.markerPath(target),
			appConfigDir: this.launcherConfig.getAppConfigDir(),
			configDefaultsDir: this.launcherConfig.getConfigDefaultsDir(),
		}, target.worktreePath);
	}

	private markerPath(target: ResolvedDiffReviewTarget): string {
		return agentMarkerPathIn(
			this.launcherConfig.getAppConfigDir(), target.projectSlug, target.folderName,
		);
	}
}
