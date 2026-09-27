import { currentCommandTemplatePlatform } from '../../../src/core/command-template/command-template-types.js'
import { shellLiteral } from '../../../src/core/command-template/command-template-interpolation.js'
import { createFixedPlatformShellRunner } from '../../../src/core/command-template/platform-shell-runner.js'

const MINIMUM_SHELL_STARTUP_DELAY_MS = 1000

/** Runs a raw script through the real platform wrapper and captures its output. */
export function runCapturedScript(script: string, cwd: string, timeoutMs = 20000): Promise<string> {
  return createFixedPlatformShellRunner().execute({
    key: 'test.capture-probe',
    platform: currentCommandTemplatePlatform(),
    script,
    cwd,
    environment: {},
    mode: 'capture',
    timeoutMs,
  })
}

export async function runDetachedProcess(executable: string, args: string[], cwd: string, detachDelayMs = 10000): Promise<void> {
  const platform = currentCommandTemplatePlatform()
  const invocation = [executable, ...args].map((value) => shellLiteral(value, platform)).join(' ')
  const effectiveDetachDelayMs = Math.max(detachDelayMs, MINIMUM_SHELL_STARTUP_DELAY_MS)
  await createFixedPlatformShellRunner().execute({
    key: 'test.detached-probe',
    platform,
    script: platform === 'windows' ? `& ${invocation}` : invocation,
    argv: [executable, ...args],
    cwd,
    environment: {},
    mode: 'detached',
    timeoutMs: effectiveDetachDelayMs,
    detachDelayMs: effectiveDetachDelayMs,
  })
}
