/* eslint-disable max-len -- one-line catalog declarations are intentionally scan-friendly */
import type {
	CommandTemplateDefinition, CommandTemplateFeatureGroup, CommandTemplateMode,
	CommandTemplatePlatform,
} from './command-template-types.js';

const ALL_PLATFORMS: readonly CommandTemplatePlatform[] = ['windows', 'macos', 'linux'];
export const gitEnvironment = {
	GIT_TERMINAL_PROMPT: '0',
	GIT_CONFIG_COUNT: '1',
	GIT_CONFIG_KEY_0: 'core.longpaths',
	GIT_CONFIG_VALUE_0: 'true',
} as const;
export const remoteGitEnvironment = {
	...gitEnvironment,
	GCM_INTERACTIVE: 'auto',
} as const;

interface DefinitionOptions {
	platforms?: readonly CommandTemplatePlatform[];
	mode?: CommandTemplateMode;
	timeoutMs?: number;
	detachDelayMs?: number;
	listPlaceholders?: readonly string[];
	git?: 'local' | 'remote';
}

function definition<Key extends string>(
	key: Key,
	label: string,
	featureGroup: CommandTemplateFeatureGroup,
	scalarPlaceholders: readonly string[] = [],
	options: DefinitionOptions = {},
): CommandTemplateDefinition & { readonly key: Key } {
	return {
		key,
		label,
		featureGroup,
		platforms: options.platforms ?? ALL_PLATFORMS,
		scalarPlaceholders,
		listPlaceholders: options.listPlaceholders ?? [],
		environment: options.git === 'remote'
			? remoteGitEnvironment
			: options.git === 'local' ? gitEnvironment : {},
		mode: options.mode ?? 'capture',
		timeoutMs: options.timeoutMs ?? 30_000,
		detachDelayMs: options.detachDelayMs,
	};
}

const GIT: CommandTemplateFeatureGroup = 'Git and repository checks';
const SYNC: CommandTemplateFeatureGroup = 'Ticket Sync';
const CONFLICT: CommandTemplateFeatureGroup = 'Conflict Resolution';
const WORKTREE: CommandTemplateFeatureGroup = 'Worktree management';
const AGENT_WORKTREE: CommandTemplateFeatureGroup = 'Agent Worktree lifecycle';
const HERDR: CommandTemplateFeatureGroup = 'Herdr integration';
const LAUNCH: CommandTemplateFeatureGroup = 'Agent launching and process inspection';
const PICKER: CommandTemplateFeatureGroup = 'File and directory pickers';
const OPEN: CommandTemplateFeatureGroup = 'Operating-system open actions';
const gitOptions = { git: 'local' } as const;
const remoteGitOptions = { git: 'remote', timeoutMs: 600_000 } as const;

export const COMMAND_TEMPLATE_DEFINITIONS = [
	definition('git.version', 'Git version', GIT, [], gitOptions),
	definition('git.common-dir.resolve', 'Resolve common Git directory', GIT, [], gitOptions),
	definition('git.main-branch.probe', 'Probe main branch', GIT, ['branch'], gitOptions),
	definition('git.stage-all', 'Stage all changes', GIT, [], gitOptions),
	definition('git.status', 'Read Git status', GIT, [], gitOptions),
	definition('git.commit', 'Commit staged changes', GIT, ['message'], gitOptions),
	definition('git.sync-pending.tracked-probe', 'Probe tracked pending changes', GIT, [], gitOptions),
	definition('git.sync-pending.untracked', 'List untracked files', GIT, [], gitOptions),
	definition('diff-review.head.resolve', 'Resolve Diff Review HEAD', GIT, [], gitOptions),
	definition('diff-review.merge-base.resolve', 'Resolve Diff Review merge-base', GIT, ['mainBranch'], gitOptions),
	definition('diff-review.tracked.files', 'List tracked Diff Review files', GIT, ['baseRef'], gitOptions),
	definition('diff-review.branch.files', 'List committed Diff Review files', GIT, ['baseRef'], gitOptions),
	definition('diff-review.last-commit.files', 'List last-commit Diff Review files', GIT, [], gitOptions),
	definition('diff-review.untracked.files', 'List untracked Diff Review files', GIT, [], gitOptions),
	definition('diff-review.file.read', 'Read Diff Review file at revision', GIT, ['refPath'], gitOptions),

	definition('ticket-sync.remote.list', 'List remotes', SYNC, [], gitOptions),
	definition('ticket-sync.upstream.resolve', 'Resolve upstream', SYNC, [], gitOptions),
	definition('ticket-sync.branch.current', 'Resolve current branch', SYNC, [], gitOptions),
	definition('ticket-sync.push.set-upstream', 'Push and set upstream', SYNC, ['remote', 'branch'], remoteGitOptions),
	definition('ticket-sync.fetch-origin', 'Fetch origin', SYNC, [], remoteGitOptions),
	definition('ticket-sync.head.resolve', 'Resolve HEAD', SYNC, [], gitOptions),
	definition('ticket-sync.upstream.repair', 'Repair upstream branch', SYNC, ['remoteBranch', 'localHead', 'upstream'], gitOptions),
	definition('ticket-sync.ref.resolve', 'Resolve ref', SYNC, ['ref'], gitOptions),
	definition('ticket-sync.merge-base', 'Resolve merge base', SYNC, ['left', 'right'], gitOptions),
	definition('ticket-sync.reset-soft', 'Soft reset', SYNC, ['ref'], gitOptions),
	definition('ticket-sync.fetch', 'Fetch upstream changes', SYNC, [], remoteGitOptions),
	definition('ticket-sync.fast-forward', 'Fast-forward merge', SYNC, ['ref'], gitOptions),
	definition('ticket-sync.push', 'Push ref', SYNC, ['remote', 'refspec'], remoteGitOptions),
	definition('ticket-sync.merge-tree', 'Build merged tree', SYNC, ['left', 'right'], gitOptions),
	definition('ticket-sync.commit-tree', 'Create merge commit', SYNC, ['tree', 'parent', 'message'], { git: 'local', listPlaceholders: ['signArgs'] }),
	definition('ticket-sync.reset-hard', 'Hard reset', SYNC, ['ref'], gitOptions),

	definition('ticket-sync.staged-files', 'List staged files', SYNC, [], gitOptions),
	definition('ticket-sync.ancestor.probe', 'Probe commit ancestry', SYNC, ['ancestor', 'descendant'], gitOptions),
	definition('ticket-sync.ahead-count', 'Count commits ahead', SYNC, ['range'], gitOptions),
	definition('ticket-sync.conflict-marker.probe', 'Probe conflict markers', SYNC, [], gitOptions),
	definition('ticket-sync.gpg-signing.read', 'Read commit signing setting', SYNC, [], gitOptions),

	definition('conflict-resolution.upstream.resolve', 'Resolve conflict upstream', CONFLICT, [], gitOptions),
	definition('conflict-resolution.scratch.create', 'Create scratch worktree', CONFLICT, ['scratch', 'ref'], gitOptions),
	definition('conflict-resolution.fetch', 'Fetch conflict upstream', CONFLICT, [], remoteGitOptions),
	definition('conflict-resolution.rebase', 'Rebase conflict worktree', CONFLICT, ['upstream'], gitOptions),
	definition('conflict-resolution.push', 'Push conflict resolution', CONFLICT, ['remote', 'refspec'], remoteGitOptions),
	definition('conflict-resolution.head.resolve', 'Resolve conflict HEAD', CONFLICT, [], gitOptions),
	definition('conflict-resolution.snapshot-base.resolve', 'Resolve snapshot base', CONFLICT, [], gitOptions),
	definition('conflict-resolution.local-changes.rebase', 'Rebase local changes', CONFLICT, ['upstream', 'snapshotBase', 'localHead'], gitOptions),
	definition('conflict-resolution.rebase.abort', 'Abort rebase', CONFLICT, [], gitOptions),
	definition('conflict-resolution.scratch.remove', 'Remove scratch worktree', CONFLICT, ['scratch'], gitOptions),

	definition('worktree.branch.local-list', 'List local worktree branch', WORKTREE, ['branch'], gitOptions),
	definition('worktree.add-existing', 'Add existing branch worktree', WORKTREE, ['worktreeDir', 'branch'], gitOptions),
	definition('worktree.create-orphan', 'Create orphan worktree', WORKTREE, ['worktreeDir', 'branch', 'message'], gitOptions),
	definition('worktree.remote.list', 'List worktree remotes', WORKTREE, [], gitOptions),
	definition('worktree.remote-branch.probe', 'Probe remote worktree branch', WORKTREE, ['remote', 'branch'], remoteGitOptions),
	definition('worktree.adopt-remote', 'Adopt remote worktree branch', WORKTREE, ['remote', 'branch', 'worktreeDir', 'remoteBranch'], remoteGitOptions),
	definition('worktree.prune', 'Prune worktrees', WORKTREE, [], gitOptions),
	definition('worktree.list', 'List worktrees', WORKTREE, [], gitOptions),

	definition('agent-worktree.list', 'List Agent Worktrees', AGENT_WORKTREE, [], gitOptions),
	definition('agent-worktree.branch.local-list', 'List local Agent Worktree branch', AGENT_WORKTREE, ['branch'], gitOptions),
	definition('agent-worktree.add-existing', 'Add existing Agent Worktree', AGENT_WORKTREE, ['worktreePath', 'branch'], gitOptions),
	definition('agent-worktree.main.status', 'Read main worktree status', AGENT_WORKTREE, [], gitOptions),
	definition('agent-worktree.behind-upstream.count', 'Count commits behind upstream', AGENT_WORKTREE, ['range'], gitOptions),
	definition('agent-worktree.create', 'Create Agent Worktree', AGENT_WORKTREE, ['branch', 'worktreePath', 'mainBranch'], gitOptions),
	definition('agent-worktree.status', 'Read Agent Worktree status', AGENT_WORKTREE, [], gitOptions),
	definition('agent-worktree.remote-branch.probe', 'Probe remote Agent Worktree branch', AGENT_WORKTREE, ['branch'], remoteGitOptions),
	definition('agent-worktree.busy.probe.macos', 'Probe busy Agent Worktree on macOS', AGENT_WORKTREE, ['worktreePath'], { platforms: ['macos'], timeoutMs: 5_000 }),
	definition('agent-worktree.busy.probe.linux', 'Probe busy Agent Worktree on Linux', AGENT_WORKTREE, ['worktreePath'], { platforms: ['linux'], timeoutMs: 5_000 }),
	definition('agent-worktree.branch.remote', 'Resolve Agent Worktree remote', AGENT_WORKTREE, ['configKey'], gitOptions),
	definition('agent-worktree.prune', 'Prune Agent Worktrees', AGENT_WORKTREE, [], gitOptions),
	definition('agent-worktree.local-branch.probe', 'Probe local Agent Worktree branch', AGENT_WORKTREE, ['ref'], gitOptions),
	definition('agent-worktree.merged.probe', 'Probe merged Agent Worktree branch', AGENT_WORKTREE, ['branch', 'mainBranch'], gitOptions),
	definition('agent-worktree.remote.list', 'List Agent Worktree remotes', AGENT_WORKTREE, [], gitOptions),
	definition('agent-worktree.main.fetch', 'Fetch main branch', AGENT_WORKTREE, ['remote', 'mainBranch'], remoteGitOptions),
	definition('agent-worktree.merge-tree', 'Build Agent Worktree merge tree', AGENT_WORKTREE, ['mainBranch', 'branch'], gitOptions),
	definition('agent-worktree.main-tree', 'Resolve main tree', AGENT_WORKTREE, ['treeRef'], gitOptions),
	definition('agent-worktree.remove', 'Remove Agent Worktree', AGENT_WORKTREE, ['worktreePath'], gitOptions),
	definition('agent-worktree.branch.delete-local', 'Delete local Agent Worktree branch', AGENT_WORKTREE, ['branch'], gitOptions),
	definition('agent-worktree.locking-processes.windows', 'Find processes locking Agent Worktree on Windows', AGENT_WORKTREE, ['scriptPath', 'worktreePath'], { platforms: ['windows'], timeoutMs: 10_000 }),
	definition('agent-worktree.branch.delete-remote', 'Delete remote Agent Worktree branch', AGENT_WORKTREE, ['branch'], remoteGitOptions),

	definition('herdr.status.server', 'Check Herdr server status', HERDR),
	definition('herdr.workspace.list', 'List Herdr workspaces', HERDR),
	definition('herdr.pane.list', 'List Herdr panes', HERDR, ['workspaceId']),
	definition('herdr.agent.list', 'List Herdr agents', HERDR),
	definition('herdr.agent.stop', 'Stop Herdr agent', HERDR, ['paneId']),
	definition('herdr.review-prompt.deliver', 'Deliver Review Prompt', HERDR, ['paneId', 'prompt']),

	definition('agent-launch.process-start.windows', 'Read Windows process start time', LAUNCH, ['pid'], { platforms: ['windows'] }),
	definition('agent-launch.process-start.macos', 'Read macOS process start time', LAUNCH, ['pid'], { platforms: ['macos'] }),

	definition('picker.files.windows', 'Pick files on Windows', PICKER, ['startDir'], { platforms: ['windows'], timeoutMs: 600_000 }),
	definition('picker.files.macos', 'Pick files on macOS', PICKER, ['startDir'], { platforms: ['macos'], timeoutMs: 600_000 }),
	definition('picker.files.linux', 'Pick files on Linux', PICKER, ['startDir'], { platforms: ['linux'], timeoutMs: 600_000 }),
	definition('picker.directory.windows', 'Pick directory on Windows', PICKER, ['startDir'], { platforms: ['windows'], timeoutMs: 600_000 }),
	definition('picker.directory.macos', 'Pick directory on macOS', PICKER, ['startDir'], { platforms: ['macos'], timeoutMs: 600_000 }),
	definition('picker.directory.linux', 'Pick directory on Linux', PICKER, ['startDir'], { platforms: ['linux'], timeoutMs: 600_000 }),

	definition('open.directory.windows', 'Open directory on Windows', OPEN, ['directory'], { platforms: ['windows'], mode: 'detached', detachDelayMs: 0 }),
	definition('open.directory.macos', 'Open directory on macOS', OPEN, ['directory'], { platforms: ['macos'], mode: 'detached', detachDelayMs: 0 }),
	definition('open.directory.linux', 'Open directory on Linux', OPEN, ['directory'], { platforms: ['linux'], mode: 'detached', detachDelayMs: 0 }),
];

/**
 * The catalog is the single source of truth for which actions exist. Deriving the
 * key union from it means a typo, a removed entry, or a key that was planned but
 * never bundled fails at compile time instead of when the command finally runs.
 */
export type CommandTemplateKey = typeof COMMAND_TEMPLATE_DEFINITIONS[number]['key'];

export { default as COMMAND_TEMPLATE_DEFAULTS } from '../../../config-defaults/command-templates.json' with { type: 'json' };

export const COMMAND_TEMPLATE_DEFINITION_BY_KEY: ReadonlyMap<string, CommandTemplateDefinition> = new Map(
	COMMAND_TEMPLATE_DEFINITIONS.map((item) => [item.key, item]),
);

/** Every catalog family that has platform-suffixed variants, derived from the keys. */
export type PlatformCommandTemplateFamily =
	CommandTemplateKey extends infer Key
		? Key extends `${infer Family}.${CommandTemplatePlatform}` ? Family : never
		: never;

function isPlatformCommandTemplateKey<Family extends PlatformCommandTemplateFamily>(
	key: string,
): key is Extract<CommandTemplateKey, `${Family}.${CommandTemplatePlatform}`> {
	return COMMAND_TEMPLATE_DEFINITION_BY_KEY.has(key);
}

/**
 * Platform-specific actions use flat suffix keys per the catalog contract. This
 * keeps that selection inside the typed catalog instead of letting call sites
 * build keys with string concatenation, which would defeat `CommandTemplateKey`.
 * The family is constrained too, so a misspelled family is a compile error
 * rather than a key that quietly resolves to `never`.
 */
export function platformCommandTemplateKey<Family extends PlatformCommandTemplateFamily>(
	family: Family,
	platform: CommandTemplatePlatform,
): Extract<CommandTemplateKey, `${Family}.${CommandTemplatePlatform}`> {
	const key = `${family}.${platform}`;
	if (!isPlatformCommandTemplateKey<Family>(key)) {
		throw new Error(`No Command Template is available for '${family}' on ${platform}.`);
	}
	return key;
}
