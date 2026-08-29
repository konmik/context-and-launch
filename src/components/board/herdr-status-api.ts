import { query } from "@solidjs/router";
import { herdrExec, reviewPromptQueueService } from "~/core/config/instances.js";
import { appLog } from "~/core/infra/app-logger.js";
import { fetchHerdrTicketState } from "~/core/herdr/herdr-client.js";
import {
  createHerdrStatusService, type HerdrAgentStatusesResult,
} from "./herdr-status-service.js";

export type { HerdrAgentStatusesResult };

const herdrStatusService = createHerdrStatusService({
  loadTicketState: (projectSlug) => fetchHerdrTicketState(projectSlug, herdrExec),
  reconcileProject: (projectSlug) => reviewPromptQueueService.reconcileProject(projectSlug),
  log: appLog,
});

export const getHerdrAgentStatuses = query(async (
  projectSlug: string,
): Promise<HerdrAgentStatusesResult> => {
  "use server";
  return herdrStatusService.getStatuses(projectSlug);
}, "herdr-agent-statuses");

export async function reconcileReviewPromptQueue(projectSlug: string) {
  "use server";
  return herdrStatusService.reconcile(projectSlug);
}
