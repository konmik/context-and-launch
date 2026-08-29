export interface LaunchRequest {
  initialPrompt: string;
  useWorktree: boolean;
  profileName: string;
  force: boolean;
  skipBehindRemote: boolean;
  launchDir: string;
}

export function parseLaunchRequest(body: unknown): LaunchRequest {
  const result: LaunchRequest = {
    initialPrompt: "", useWorktree: false, profileName: "", force: false,
    skipBehindRemote: false, launchDir: "",
  };
  if (body && typeof body === "object") {
    const request = body as Record<string, unknown>;
    if (typeof request.initialPrompt === "string") result.initialPrompt = request.initialPrompt;
    if (typeof request.useWorktree === "boolean") result.useWorktree = request.useWorktree;
    if (typeof request.profileName === "string") result.profileName = request.profileName;
    if (typeof request.force === "boolean") result.force = request.force;
    if (typeof request.skipBehindRemote === "boolean") result.skipBehindRemote = request.skipBehindRemote;
    if (typeof request.launchDir === "string") result.launchDir = request.launchDir;
  }
  return result;
}

export async function readLaunchRequest(request: Request): Promise<LaunchRequest> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn("Failed to parse request body, using defaults:", error);
  }
  return parseLaunchRequest(body);
}
