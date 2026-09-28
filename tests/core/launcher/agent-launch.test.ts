import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import { fromPartial } from '@total-typescript/shoehorn'
import type { CommandTemplateService } from '../../../src/core/command-template/command-template-service.js'
import { parseLaunchRequest } from '../../../src/core/launcher/launch-request.js'
import { buildAgentDisplayName, buildWindowTitle, runLauncherProfile } from '../../../src/core/launcher/profile-launch.js'

const executeTrustedScript = vi.fn().mockResolvedValue('')

const commands = fromPartial<CommandTemplateService>({
  executeTrustedScript,
})

describe('buildWindowTitle', () => {
  const task = {
    number: 'ST-47',
    title: 'Fix login timeout',
  }
  it('uses the Agent Worktree folder when launching in a worktree', () => {
    const worktreePath = path.join('root', 'worktrees', 'st-47-fix-login-timeout')
    expect(
      buildWindowTitle(task, {
        worktreePath,
      }),
    ).toBe('st-47-fix-login-timeout -- AI')
  })
  it('uses the Task title, Task Number, and Project name without a worktree', () => {
    expect(
      buildWindowTitle(task, {
        projectName: 'Alpha',
      }),
    ).toBe('Fix login timeout ST-47 - Alpha -- AI')
  })
})
describe('buildAgentDisplayName', () => {
  it('builds the Agent name without the terminal title suffix', () => {
    expect(
      buildAgentDisplayName(
        {
          number: 'ST-47',
          title: 'Fix login timeout',
        },
        {
          projectName: 'Alpha',
        },
      ),
    ).toBe('Fix login timeout ST-47 - Alpha')
  })
})
describe('parseLaunchRequest', () => {
  it('parseLaunchRequest with initialPrompt extracts string value', () => {
    const result = parseLaunchRequest({
      initialPrompt: 'do the thing',
    })
    expect(result.initialPrompt).toBe('do the thing')
  })
  it('parseLaunchRequest with profileName extracts string value', () => {
    const result = parseLaunchRequest({
      profileName: 'Claude Win',
    })
    expect(result.profileName).toBe('Claude Win')
  })
  it('parseLaunchRequest with missing fields defaults correctly', () => {
    const result = parseLaunchRequest({})
    expect(result.initialPrompt).toBe('')
    expect(result.profileName).toBe('')
    expect(result.useWorktree).toBe(false)
    expect(result.force).toBe(false)
    expect(result.skipBehindRemote).toBe(false)
    expect(result.launchDir).toBe('')
  })
  it('parseLaunchRequest with launchDir extracts string value', () => {
    const result = parseLaunchRequest({
      launchDir: '/my/dir',
    })
    expect(result.launchDir).toBe('/my/dir')
  })
  it('parseLaunchRequest with non-string initialPrompt defaults to empty string', () => {
    const result = parseLaunchRequest({
      initialPrompt: 42,
    })
    expect(result.initialPrompt).toBe('')
  })
})
describe('spawnProfile trusted script execution', () => {
  it('passes the complete custom body and values to the fixed shell service', async () => {
    await runLauncherProfile(
      commands,
      {
        name: 'Custom',
        command: 'my-agent --flag {{initialPrompt}}',
      },
      {
        configDefaultsDir: '/fake/config-defaults',
        initialPrompt: 'do the thing',
        windowTitle: 'Custom',
        agentDisplayName: 'Custom',
        herdrWorkspaceLabel: 'project',
        herdrPaneLabel: 'project--task',
        markerPath: '/fake/marker.json',
        appConfigDir: '/fake/config',
      },
      '/fake/cwd',
    )
    expect(executeTrustedScript).toHaveBeenCalledWith(
      expect.objectContaining({
        source: {
          kind: 'profile',
          profileName: 'Custom',
        },
        script: 'my-agent --flag {{initialPrompt}}',
        values: expect.objectContaining({
          configDefaultsDir: '/fake/config-defaults',
          initialPrompt: 'do the thing',
        }),
        cwd: '/fake/cwd',
      }),
    )
  })
})
