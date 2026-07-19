import { query } from "@solidjs/router";
import { launcherConfigManager } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";
import { errorMessage } from "~/core/shared/errors.js";
import {
  fetchHerdrTicketStatuses, usesHerdrLaunchTarget, type HerdrAgentStatus,
} from "~/core/herdr/herdr-client.js";

export type HerdrAgentStatusesResult =
  | { kind: "disabled" }
  | { kind: "available"; statusesByFolderName: Record<string, HerdrAgentStatus> }
  | { kind: "unavailable" };

export const getHerdrAgentStatuses = query(async (
  projectSlug: string,
): Promise<HerdrAgentStatusesResult> => {
  "use server";
  const merged = launcherConfigManager.getMergedConfig(projectSlug);
  if (!merged.profiles.some(p => usesHerdrLaunchTarget(p.command))) {
    return { kind: "disabled" };
  }
  try {
    return {
      kind: "available",
      statusesByFolderName: await fetchHerdrTicketStatuses(projectSlug),
    };
  } catch (e) {
    appLog("herdr", `agent status query failed: ${errorMessage(e)}`);
    return { kind: "unavailable" };
  }
}, "herdr-agent-statuses");
