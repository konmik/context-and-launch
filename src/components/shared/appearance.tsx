import { createContext, createEffect, createMemo, type Accessor } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { useLocation } from '@solidjs/router'
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js'
import { succeed } from '~/util/result.js'
import { getStoredPalette, paletteStorageKey, projectSlugFromPath, type PaletteName } from './palette-pure.js'
import { getStoredMode, isDarkMode, modeStorageKey, type AppMode } from './theme-toggle-pure.js'

export interface AppearanceStorage {
  palette: StoredSignal<PaletteName>
  mode: StoredSignal<AppMode>
}

export const AppearanceContext = createContext<Accessor<AppearanceStorage>>()

export function AppearanceRoot(props: { children: JSX.Element }): JSX.Element {
  const location = useLocation()
  const projectSlug = createMemo(() => projectSlugFromPath(location.pathname))
  const appearance = createMemo(() => createAppearanceStorage(localStorage, projectSlug()))
  createEffect(
    () => ({
      palette: appearance().palette.get(),
      mode: appearance().mode.get(),
    }),
    ({ palette, mode }) => {
      document.documentElement.dataset.palette = palette
      const dark = isDarkMode(mode, window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      window.contextLaunch?.setAppearance(palette, mode)
    },
  )
  return <AppearanceContext value={appearance}>{props.children}</AppearanceContext>
}

export function createAppearanceStorage(storage: Pick<Storage, 'getItem' | 'setItem'>, projectSlug?: string): AppearanceStorage {
  return {
    palette: createStoredSignal(
      () => getStoredPalette(storage, projectSlug),
      async (transform) => {
        const palette = transform(getStoredPalette(storage, projectSlug))
        storage.setItem(paletteStorageKey(projectSlug), palette)
        return succeed(palette)
      },
    ),
    mode: createStoredSignal(
      () => getStoredMode(storage, projectSlug),
      async (transform) => {
        const mode = transform(getStoredMode(storage, projectSlug))
        storage.setItem(modeStorageKey(projectSlug), mode)
        return succeed(mode)
      },
    ),
  }
}
