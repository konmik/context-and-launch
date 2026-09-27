import { createContext, type Accessor } from 'solid-js'
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js'
import { success } from '~/util/result.js'
import { getStoredPalette, paletteStorageKey, type PaletteName } from './palette-pure.js'
import { getStoredMode, modeStorageKey, type AppMode } from './theme-toggle-pure.js'

export interface AppearanceStorage {
  palette: StoredSignal<PaletteName>
  mode: StoredSignal<AppMode>
}

export const AppearanceContext = createContext<Accessor<AppearanceStorage>>()

export function createAppearanceStorage(storage: Pick<Storage, 'getItem' | 'setItem'>, projectSlug?: string): AppearanceStorage {
  return {
    palette: createStoredSignal(
      () => getStoredPalette(storage, projectSlug),
      async (transform) => {
        const palette = transform(getStoredPalette(storage, projectSlug))
        storage.setItem(paletteStorageKey(projectSlug), palette)
        return success(palette)
      },
    ),
    mode: createStoredSignal(
      () => getStoredMode(storage, projectSlug),
      async (transform) => {
        const mode = transform(getStoredMode(storage, projectSlug))
        storage.setItem(modeStorageKey(projectSlug), mode)
        return success(mode)
      },
    ),
  }
}
