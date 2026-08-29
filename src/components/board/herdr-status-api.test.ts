import { beforeEach, describe, expect, it, vi } from "vitest";
import { HerdrUnavailableError } from "~/core/herdr/herdr-availability.js";
import { createHerdrStatusService } from "./herdr-status-service.js";

const fetchHerdrTicketState = vi.fn();
const reconcileProject = vi.fn();

const log = vi.fn();
const service = createHerdrStatusService({
  loadTicketState: fetchHerdrTicketState,
  reconcileProject,
  log,
});

describe("getHerdrAgentStatuses", () => {
  beforeEach(() => {
    fetchHerdrTicketState.mockReset();
    reconcileProject.mockReset();
    reconcileProject.mockResolvedValue(undefined);
  });

  it("reads Agent statuses without mutating the Review Prompt Queue", async () => {
    const agents = [{ pane_id: "pane-1" }];
    fetchHerdrTicketState.mockResolvedValue({
      statusesByFolderName: { "st-1-ticket": "idle" },
      agents,
    });

    const result = await service.getStatuses("project");

    expect(result).toEqual({
      kind: "available",
      statusesByFolderName: { "st-1-ticket": "idle" },
    });
    expect(reconcileProject).not.toHaveBeenCalled();
  });

  it("reports unavailable without mutating the Review Prompt Queue", async () => {
    fetchHerdrTicketState.mockRejectedValue(
      new HerdrUnavailableError("server-not-running"),
    );

    const result = await service.getStatuses("project");

    expect(result).toEqual({ kind: "unavailable" });
    expect(reconcileProject).not.toHaveBeenCalled();
  });

  it("reports disabled without mutating the Review Prompt Queue", async () => {
    fetchHerdrTicketState.mockRejectedValue(new HerdrUnavailableError("cli-missing"));

    const result = await service.getStatuses("project");

    expect(result).toEqual({ kind: "disabled" });
    expect(reconcileProject).not.toHaveBeenCalled();
  });

  it("leaves the Review Prompt Queue alone when Herdr fails for another reason", async () => {
    fetchHerdrTicketState.mockRejectedValue(new Error("workspace list exploded"));

    const result = await service.getStatuses("project");

    expect(result).toEqual({ kind: "unavailable" });
    expect(reconcileProject).not.toHaveBeenCalled();
  });

  it("asks the queue service to reconcile the project explicitly", async () => {
    await expect(service.reconcile("project")).resolves.toEqual({ ok: true });
    expect(reconcileProject).toHaveBeenCalledWith("project");
  });

  it("surfaces explicit reconciliation failures", async () => {
    reconcileProject.mockRejectedValue(new Error("workspace list exploded"));

    await expect(service.reconcile("project")).resolves.toEqual({
      ok: false,
      message: "workspace list exploded",
    });
  });
});
