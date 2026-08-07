import { query } from "@solidjs/router";
import { herdrExec, reviewPromptQueueService } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";
import { errorMessage } from "~/core/shared/errors.js";
import { HerdrUnavailableError } from "~/core/herdr/herdr-availability.js";
import {
  fetchHerdrTicketState, type HerdrAgentStatus,
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
    const { statusesByFolderName, agents } = await fetchHerdrTicketState(
      projectSlug, herdrExec,
    );
    await reviewPromptQueueService.process(agents);
    return { kind: "available", statusesByFolderName };
  } catch (e) {
    // A missing Herdr CLI is an answer, not a failure: nothing about this
    // machine will change until Herdr is installed, so the client stops polling
    // instead of spawning a shell for the same answer every few seconds. A
    // stopped Herdr server is transient, so polling continues.
    if (e instanceof HerdrUnavailableError) {
      appLog("herdr", `agent status unavailable: ${e.message}`);
      return e.reason === "cli-missing" ? { kind: "disabled" } : { kind: "unavailable" };
    }
    appLog("herdr", `agent status query failed: ${errorMessage(e)}`);
    return { kind: "unavailable" };
  }
}, "herdr-agent-statuses");
