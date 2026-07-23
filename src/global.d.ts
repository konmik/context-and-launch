/// <reference types="@solidjs/start/env" />

declare module '*.ps1?raw' {
  const content: string;
  export default content;
}

declare module '*.sh?raw' {
  const content: string;
  export default content;
}

declare module '*.json?raw' {
  const content: string;
  export default content;
}

interface Window {
  contextLaunch?: {
    setPalette(name: string): void;
    setMode(mode: string): void;
  };
}
