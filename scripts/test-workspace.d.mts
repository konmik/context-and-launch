export const activeMarkerName: string;
export const workspaceEnvironmentName: string;
export const tokenEnvironmentName: string;

export interface WorkspaceIdentity {
  sourcePath: string;
  sourceRef: string;
  workspaceKey: string;
}

export interface ActiveWorkspaceMarker extends WorkspaceIdentity {
  managedBy: "context-launch-test-runner";
  version: 1;
  kind: "active-workspace";
  directory: string;
  active: true;
  token: string;
}

export function canonicalPath(value: string): string;
export function createWorkspaceKey(sourcePath: string, sourceRef: string): string;
export function getWorkspaceIdentity(sourceDirectory: string): WorkspaceIdentity;
export function createActiveMarker(
  workspace: string,
  identity: WorkspaceIdentity,
): ActiveWorkspaceMarker;
export function readActiveMarker(workspace: string): ActiveWorkspaceMarker;
