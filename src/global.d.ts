/// <reference types="@solidjs/vite-plugin/boundary-modules" />
declare module '*.ps1?raw' {
  const content: string
  export default content
}

declare module '*.sh?raw' {
  const content: string
  export default content
}

declare module '*.json?raw' {
  const content: string
  export default content
}

interface Window {
  contextLaunch?: {
    setAppearance(
      palette: import('./components/shared/palette-pure.js').PaletteName,
      mode: import('./components/shared/theme-toggle-pure.js').AppMode,
    ): void
    pickDirectory(preselect: string): Promise<import('./util/result.js').Result<string | undefined, string>>
  }
}
