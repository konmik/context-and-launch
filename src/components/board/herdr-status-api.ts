import { query } from "@solidjs/router";
import { herdrExec, reviewPromptQueueService } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";
import { errorMessage } from "~/core/shared/errors.js";
import { HerdrUnavailableError } from "~/core/herdr/herdr-availability.js";
import {
  fetchHerdrTicketState, type HerdrAgentStatus, type HerdrTicketState,
} from "~/core/herdr/herdr-client.js";

export type HerdrAgentStatusesResult =
  | { kind: "disabled" }
  | { kind: "available"; statusesByFolderName: Record<string, HerdrAgentStatus> }
  | { kind: "unavailable" };

export const getHerdrAgentStatuses = query(async (
  projectSlug: string,
): Promise<HerdrAgentStatusesResult> => {
  "use server";
  let state: HerdrTicketState;
  try {
    state = await fetchHerdrTicketState(projectSlug, herdrExec);
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
  return { kind: "available", statusesByFolderName: state.statusesByFolderName };
}, "herdr-agent-statuses");

export async function reconcileReviewPromptQueue(projectSlug: string) {
  "use server";
  try {
    await reviewPromptQueueService.reconcileProject(projectSlug);
    return { ok: true as const };
  } catch (error) {
    appLog("diff-review", `queue reconciliation failed: ${errorMessage(error)}`, { projectSlug });
    return { ok: false as const, message: errorMessage(error) };
  }
}
