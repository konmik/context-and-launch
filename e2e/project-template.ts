import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GlobalSetupContext } from 'vitest/node'
import { removeTempDirOrWarn } from '../src/test-temp.js'
import { gitFastImport, gitSync } from '../src/test-git.js'
import { TICKETS_BRANCH } from './git-fixtures.js'

export interface ProjectTemplate {
  localRepo: string
  /** A repo with main and the tickets Orphan Branch, tracking remote. */
  repo: string
  /** A bare remote holding main and the tickets Orphan Branch. */
  remote: string
}

declare module 'vitest' {
  export interface ProvidedContext {
    projectTemplate: ProjectTemplate
  }
}

/**
 * Builds the Project template that e2e fixtures copy instead of running the git
 * ceremony per Project. Vitest runs this once before any worker starts, so the
 * fixtures need no cross-worker coordination, and the teardown removes the
 * template so no run inherits a stale one.
 */
export default async function setup({ provide }: GlobalSetupContext): Promise<() => void> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-e2e-template-'))
  const repo = path.join(base, 'repo')
  const remote = path.join(base, 'remote.git')
  const localRepo = path.join(base, 'local-repo')
  fs.mkdirSync(localRepo, {
    recursive: true,
  })
  gitSync(localRepo, 'init', '-b', 'main')
  await gitFastImport(
    localRepo,
    [
      'feature done',
      ...['main', TICKETS_BRANCH].flatMap((branch, index) => [
        `commit refs/heads/${branch}`,
        `committer Test <test@test.com> ${1767225600 + index} +0000`,
        'data 4',
        'init',
        '',
      ]),
      'done',
      '',
    ].join('\n'),
  )
  gitSync(base, 'clone', '--bare', localRepo, remote)
  gitSync(base, 'clone', remote, repo)
  gitSync(repo, 'branch', '--track', TICKETS_BRANCH, `origin/${TICKETS_BRANCH}`)
  gitSync(remote, 'symbolic-ref', 'HEAD', `refs/heads/${TICKETS_BRANCH}`)
  provide('projectTemplate', {
    localRepo,
    repo,
    remote,
  })
  return async () => {
    await removeTempDirOrWarn(base)
  }
}
