export interface RuntimeMount {
  drive: string;
  target: string;
}

export interface RuntimeMountPlan {
  drive: string;
  release: string[];
}

export function parseMountTable(substOutput: string): RuntimeMount[];
export function planRuntimeMount(
  mounts: RuntimeMount[],
  directory: string,
  directoryExists: (candidate: string) => boolean,
): RuntimeMountPlan;
export function readMountTable(): RuntimeMount[];
export function mountRuntime(directory: string): string;
export function unmountRuntime(drive: string): void;
