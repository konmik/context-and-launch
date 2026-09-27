import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickDirectory } from '../../../src/components/shared/directory-picker.js'

afterEach(() => {
  delete window.contextLaunch
})
describe('pickDirectory', () => {
  it("uses Electron's native directory picker when the desktop bridge is available", async () => {
    const nativePicker = vi.fn().mockResolvedValue({
      type: 'Success',
      value: 'C:\\worktrees',
    })
    window.contextLaunch = {
      setAppearance: vi.fn(),
      pickDirectory: nativePicker,
    }
    await expect(pickDirectory('C:\\projects')).resolves.toEqual({
      type: 'Success',
      value: 'C:\\worktrees',
    })
    expect(nativePicker).toHaveBeenCalledWith('C:\\projects')
  })
})
