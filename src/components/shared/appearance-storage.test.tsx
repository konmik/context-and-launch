import { beforeEach, describe, expect, it } from 'vitest'
import { createRoot, flush } from 'solid-js'
import { createAppearanceStorage } from './appearance.js'

const values = new Map<string, string>()

const localStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value)
  },
}

beforeEach(() => values.clear())
describe('appearance storage', () => {
  it('pins a selected inherited palette without pinning the inherited mode', async () => {
    await createRoot(async (dispose) => {
      try {
        localStorage.setItem('palette', 'nord')
        localStorage.setItem('theme', 'dark')
        const project = createAppearanceStorage(localStorage, 'first')
        expect(project.palette.get()).toBe('nord')
        expect(project.mode.get()).toBe('dark')
        await project.palette.update(() => 'nord')
        expect(localStorage.getItem('palette:first')).toBe('nord')
        expect(localStorage.getItem('theme:first')).toBeNull()
        localStorage.setItem('palette', 'dracula')
        const other = createAppearanceStorage(localStorage, 'second')
        expect(other.palette.get()).toBe('dracula')
        expect(project.palette.get()).toBe('nord')
      } finally {
        dispose()
      }
    })
  })
  it('queues mode changes against current storage and publishes the saved result', async () => {
    await createRoot(async (dispose) => {
      try {
        const appearance = createAppearanceStorage(localStorage)
        expect(appearance.mode.get()).toBe('system')
        localStorage.setItem('theme', 'dark')
        const toggle = () => appearance.mode.update((mode) => (mode === 'dark' ? 'light' : 'dark'))
        await Promise.all([toggle(), toggle()])
        flush()
        expect(appearance.mode.get()).toBe('dark')
        expect(localStorage.getItem('theme')).toBe('dark')
        expect(localStorage.getItem('palette')).toBeNull()
      } finally {
        dispose()
      }
    })
  })
})
