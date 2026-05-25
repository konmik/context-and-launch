/// <reference types="@solidjs/start/env" />

declare module '*.ps1?raw' {
  const content: string;
  export default content;
}

declare module '*.sh?raw' {
  const content: string;
  export default content;
}
