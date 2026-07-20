import { currentCommandTemplatePlatform } from './command-template-types.js';
import { shellLiteral } from './command-template-interpolation.js';
import { FixedPlatformShellRunner } from './platform-shell-runner.js';

const MINIMUM_SHELL_STARTUP_DELAY_MS = 1_000;

/** Runs a raw script through the real platform wrapper and captures its output. */
export function runCapturedScript(script: string, cwd: string, timeoutMs = 20_000): Promise<string> {
	return new FixedPlatformShellRunner().execute({
		key: 'test.capture-probe',
		platform: currentCommandTemplatePlatform(),
		script,
		cwd,
		environment: {},
		mode: 'capture',
		timeoutMs,
	});
}

export async function runDetachedProcess(
	executable: string,
	args: string[],
	cwd: string,
	detachDelayMs = 10_000,
): Promise<void> {
	const platform = currentCommandTemplatePlatform();
	const invocation = [executable, ...args].map((value) => shellLiteral(value, platform)).join(' ');
	const effectiveDetachDelayMs = Math.max(detachDelayMs, MINIMUM_SHELL_STARTUP_DELAY_MS);
	await new FixedPlatformShellRunner().execute({
		key: 'test.detached-probe',
		platform,
		script: platform === 'windows' ? `& ${invocation}` : invocation,
		cwd,
		environment: {},
		mode: 'detached',
		timeoutMs: effectiveDetachDelayMs,
		detachDelayMs: effectiveDetachDelayMs,
	});
}
