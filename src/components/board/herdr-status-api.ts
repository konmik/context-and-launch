import { query } from "@solidjs/router";
import { herdrExec } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";
import { errorMessage, ProcessError } from "~/core/shared/errors.js";
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
    // A missing Herdr CLI is an answer, not a failure: nothing about this
    // machine will change until Herdr is installed, so the client stops polling
    // instead of spawning a shell for the same answer every few seconds.
    if (e instanceof ProcessError && e.kind === "command-not-found") {
      appLog("herdr", "agent status polling disabled: the Herdr CLI is not installed");
      return { kind: "disabled" };
    }
    appLog("herdr", `agent status query failed: ${errorMessage(e)}`);
    return { kind: "unavailable" };
  }
}, "herdr-agent-statuses");
