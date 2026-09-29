import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHerdrUnavailableError } from '~/core/herdr/herdr-availability.js'
import { createHerdrStatusService } from '../../../src/components/board/herdr-status-service.js'

const fetchHerdrTaskState = vi.fn()

const reconcileProject = vi.fn()

const log = vi.fn()

const service = createHerdrStatusService({
  loadTaskState: fetchHerdrTaskState,
  reconcileProject,
  log,
})

describe('getHerdrAgentStatuses', () => {
  beforeEach(() => {
    fetchHerdrTaskState.mockReset()
    reconcileProject.mockReset()
    reconcileProject.mockResolvedValue(undefined)
  })
  it('reads Agent statuses without mutating the Review Prompt Queue', async () => {
    const agents = [
      {
        pane_id: 'pane-1',
      },
    ]
    fetchHerdrTaskState.mockResolvedValue({
      statusesByFolderName: {
        'st-1-task': 'idle',
      },
      agents,
    })
    const result = await service.getStatuses('project')
    expect(result).toEqual({
      kind: 'server-running',
      statusesByFolderName: {
        'st-1-task': 'idle',
      },
    })
    expect(reconcileProject).not.toHaveBeenCalled()
  })
  it('reports server-not-running without an error or mutating the Review Prompt Queue', async () => {
    fetchHerdrTaskState.mockRejectedValue(createHerdrUnavailableError('server-not-running'))
    const result = await service.getStatuses('project')
    expect(result).toEqual({
      kind: 'server-not-running',
    })
    expect(reconcileProject).not.toHaveBeenCalled()
  })
  it('reports cli-missing without mutating the Review Prompt Queue', async () => {
    fetchHerdrTaskState.mockRejectedValue(createHerdrUnavailableError('cli-missing'))
    const result = await service.getStatuses('project')
    expect(result).toEqual({
      kind: 'cli-missing',
    })
    expect(reconcileProject).not.toHaveBeenCalled()
  })
  it('leaves the Review Prompt Queue alone when Herdr fails for another reason', async () => {
    fetchHerdrTaskState.mockRejectedValue(new Error('workspace list exploded'))
    const result = await service.getStatuses('project')
    expect(result).toEqual({
      kind: 'status-query-failed',
      error: {
        title: 'Herdr agent status query failed',
        description: 'workspace list exploded',
      },
    })
    expect(reconcileProject).not.toHaveBeenCalled()
  })
  it('asks the queue service to reconcile the project explicitly', async () => {
    await expect(service.reconcile('project')).resolves.toEqual({
      type: 'Success',
      value: undefined,
    })
    expect(reconcileProject).toHaveBeenCalledWith('project')
  })
  it('surfaces explicit reconciliation failures', async () => {
    reconcileProject.mockRejectedValue(new Error('workspace list exploded'))
    await expect(service.reconcile('project')).resolves.toEqual({
      type: 'Failure',
      error: {
        title: 'Review queue reconciliation failed',
        description: 'workspace list exploded',
      },
    })
  })
})
