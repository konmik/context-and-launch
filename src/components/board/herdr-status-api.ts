import { query } from "@solidjs/router";
import { herdrExec } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";
import { errorMessage } from "~/core/shared/errors.js";
import {
  fetchHerdrTicketStatuses, type HerdrAgentStatus,
} from "~/core/herdr/herdr-client.js";

export type HerdrAgentStatusesResult =
  | { kind: "disabled" }
  | { kind: "available"; statusesByFolderName: Record<string, HerdrAgentStatus> }
  | { kind: "unavailable" };

export const getHerdrAgentStatuses = query(async (
  projectSlug: string,
): Promise<HerdrAgentStatusesResult> => {
  "use server";
  try {
    return {
      kind: "available",
      statusesByFolderName: await fetchHerdrTicketStatuses(projectSlug, herdrExec),
    };
  } catch (e) {
    appLog("herdr", `agent status query failed: ${errorMessage(e)}`);
    return { kind: "unavailable" };
  }
}, "herdr-agent-statuses");
