import * as v from "valibot";

export interface LaunchRequest {
  initialPrompt: string;
  useWorktree: boolean;
  profileName: string;
  force: boolean;
  skipBehindRemote: boolean;
  launchDir: string;
}

const LaunchRequestSchema = v.object({
  initialPrompt: v.fallback(v.string(), ""),
  useWorktree: v.fallback(v.boolean(), false),
  profileName: v.fallback(v.string(), ""),
  force: v.fallback(v.boolean(), false),
  skipBehindRemote: v.fallback(v.boolean(), false),
  launchDir: v.fallback(v.string(), ""),
});

const emptyLaunchRequest = (): LaunchRequest => ({
  initialPrompt: "", useWorktree: false, profileName: "", force: false,
  skipBehindRemote: false, launchDir: "",
});

export function parseLaunchRequest(body: unknown): LaunchRequest {
  const parsed = v.safeParse(LaunchRequestSchema, body);
  return parsed.success ? parsed.output : emptyLaunchRequest();
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
