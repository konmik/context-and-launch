import { createEffect, createMemo } from 'solid-js'
import type { JSX } from '@solidjs/web'
import { useLocation } from '@solidjs/router'
import { projectSlugFromPath } from './palette-pure.js'
import { isDarkMode } from './theme-toggle-pure.js'
import { createAppearanceStorage, AppearanceContext } from './appearance.js'

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
