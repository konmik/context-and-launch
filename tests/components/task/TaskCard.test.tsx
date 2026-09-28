import type { RenderResult } from '../../test-render.js'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup, waitFor } from '../../test-render.js'
import TaskCard from '../../../src/components/task/TaskCard'
import { HerdrStatusesContext } from '../../../src/components/task/herdr-statuses-context.js'
import type { HerdrAgentStatus } from '~/core/herdr/herdr-client.js'
import type { TaskInfo } from '~/core/task/task-store.js'

function makeTask(overrides?: Partial<TaskInfo>): TaskInfo {
  return {
    number: 'T-1',
    title: 'Test task',
    status: 'todo',
    folderName: 't-1-test-task',
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  }
}

function renderCard(props: {
  task?: Partial<TaskInfo>
  herdrStatuses?: Record<string, HerdrAgentStatus>
  onDelete?: (task: TaskInfo) => void
  onArchive?: (task: TaskInfo) => void
  onOpenFolder?: (task: TaskInfo) => void
}): RenderResult {
  return render(() => (
    <HerdrStatusesContext value={(folderName) => props.herdrStatuses?.[folderName]}>
      <TaskCard
        task={makeTask(props.task)}
        onDelete={props.onDelete ?? (() => {})}
        onArchive={props.onArchive ?? (() => {})}
        onViewDetail={() => {}}
        onOpenFolder={props.onOpenFolder ?? (() => {})}
      />
    </HerdrStatusesContext>
  ))
}

function requiredElement(container: ParentNode, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Expected element matching ${selector}`)
  return element
}

describe('TaskCard overflow menu', () => {
  afterEach(() => cleanup())
  it('shows Archive option in the overflow menu', async () => {
    const onArchive = vi.fn()
    const { container } = renderCard({
      onArchive,
    })
    const menuBtn = requiredElement(container, "[aria-label='Task actions']")
    await fireEvent.click(menuBtn)
    await waitFor(() => {
      const items = [...document.querySelectorAll("[role='menuitem']")].map((el) => el.textContent?.trim())
      expect(items).toContain('Archive')
    })
  })
  it('calls onArchive when Archive is clicked', async () => {
    const onArchive = vi.fn()
    const { container } = renderCard({
      onArchive,
    })
    const menuBtn = requiredElement(container, "[aria-label='Task actions']")
    await fireEvent.click(menuBtn)
    const archiveItem = await waitFor(() => {
      const el = [...document.querySelectorAll<HTMLElement>("[role='menuitem']")].find((el) => el.textContent?.trim() === 'Archive')
      if (!el) throw new Error('Archive item not yet rendered')
      return el
    })
    await fireEvent.click(archiveItem)
    expect(onArchive).toHaveBeenCalledWith(makeTask())
  })
  it('calls onOpenFolder when Open task folder is clicked', async () => {
    const onOpenFolder = vi.fn()
    const { container } = renderCard({
      onOpenFolder,
    })
    const menuBtn = requiredElement(container, "[aria-label='Task actions']")
    await fireEvent.click(menuBtn)
    const openFolderItem = await waitFor(() => {
      const el = [...document.querySelectorAll<HTMLElement>("[role='menuitem']")].find(
        (el) => el.textContent?.trim() === 'Open task folder',
      )
      if (!el) throw new Error('Open task folder item not yet rendered')
      return el
    })
    await fireEvent.click(openFolderItem)
    expect(onOpenFolder).toHaveBeenCalledWith(makeTask())
  })
  it('shows both menu options', async () => {
    cleanup()
    const { container } = renderCard({})
    const menuBtn = requiredElement(container, "[aria-label='Task actions']")
    await fireEvent.click(menuBtn)
    await waitFor(() => {
      const items = [...document.querySelectorAll("[role='menuitem']")].map((el) => el.textContent?.trim())
      expect(items).not.toContain('Edit')
      expect(items).toContain('Open task folder')
      expect(items).toContain('Archive')
      expect(items).toContain('Delete')
    })
  })
})
describe('TaskCard status swatch and herdr icon', () => {
  afterEach(() => cleanup())
  it('renders no status swatch', () => {
    const { container } = renderCard({
      task: {
        status: 'todo',
      },
    })
    expect(container.querySelector('[data-testid="status-swatch"]')).toBeNull()
  })
  it('renders the herdr icon when the task has a status', () => {
    const { container } = renderCard({
      herdrStatuses: {
        't-1-test-task': 'working',
      },
    })
    const icon = requiredElement(container, '[data-testid="herdr-status-icon"]')
    expect(icon).toBeTruthy()
    expect(icon.getAttribute('data-herdr-status')).toBe('working')
  })
  it('renders no herdr icon without a status', () => {
    const { container } = renderCard({})
    expect(container.querySelector('[data-testid="herdr-status-icon"]')).toBeNull()
  })
})
