import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot } from "solid-js";

vi.mock("@solidjs/router", () => ({
  revalidate: vi.fn(),
}));

import { createTicketDetailState } from "./ticket-detail-state.js";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

function makeTicketInfo(overrides?: Partial<TicketInfo>): TicketInfo {
  return {
    number: "T-1",
    title: "Test ticket",
    status: "todo",
    folderName: "001-test-ticket",
    contextNames: ["to-do"],
    useWorktree: false,
    fileNames: [],
    references: [],
    ...overrides,
  };
}

describe("ticket-detail-state uses savedFolderName after header rename", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: Array<[string, RequestInit?]>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    globalThis.fetch = vi.fn((...args: Parameters<typeof fetch>) => {
      fetchCalls.push(args as [string, RequestInit?]);
      return Promise.resolve(new Response(JSON.stringify({ folderName: "t-99-test-ticket" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("persistWorktree uses the renamed folder after saveTicketHeader", async () => {
    let ctrl!: ReturnType<typeof createTicketDetailState>;
    createRoot(async (dispose) => {
      ctrl = createTicketDetailState({
        ticket: makeTicketInfo(),
        projectSlug: "my-project",
        onClose: vi.fn(),
      });
      dispose();
    });

    ctrl.setEditedNumber("T-99");
    await ctrl.saveAll();

    fetchCalls.length = 0;
    ctrl.persistWorktree(true);
    await new Promise((r) => setTimeout(r, 0));

    const worktreeCall = fetchCalls.find(
      ([url]) => url.includes("/use-worktree"),
    );
    expect(worktreeCall).toBeTruthy();
    expect(worktreeCall![0]).toContain("/board/tickets/t-99-test-ticket/use-worktree");
  });

  it("runShortcut uses the renamed folder after saveTicketHeader", async () => {
    let ctrl!: ReturnType<typeof createTicketDetailState>;
    createRoot(async (dispose) => {
      ctrl = createTicketDetailState({
        ticket: makeTicketInfo(),
        projectSlug: "my-project",
        onClose: vi.fn(),
      });
      dispose();
    });

    ctrl.setEditedNumber("T-99");
    await ctrl.saveAll();

    fetchCalls.length = 0;
    await ctrl.runShortcut("test-shortcut");

    const shortcutCall = fetchCalls.find(
      ([url]) => url.includes("/shortcut/run"),
    );
    expect(shortcutCall).toBeTruthy();
    expect(shortcutCall![0]).toContain("/board/tickets/t-99-test-ticket/shortcut/run");
  });
});

describe("ticket-detail-state beforeunload guards header changes", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ content: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
    ) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fires preventDefault when header has unsaved changes", () => {
    createRoot((dispose) => {
      const ctrl = createTicketDetailState({
        ticket: makeTicketInfo(),
        projectSlug: "my-project",
        onClose: vi.fn(),
      });

      ctrl.setEditedTitle("Changed Title");

      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const spy = vi.spyOn(event, "preventDefault");
      window.dispatchEvent(event);
      expect(spy).toHaveBeenCalled();

      dispose();
    });
  });

  it("does not fire preventDefault when header is clean", () => {
    createRoot((dispose) => {
      const ctrl = createTicketDetailState({
        ticket: makeTicketInfo(),
        projectSlug: "my-project",
        onClose: vi.fn(),
      });

      const event = new Event("beforeunload") as BeforeUnloadEvent;
      const spy = vi.spyOn(event, "preventDefault");
      window.dispatchEvent(event);
      expect(spy).not.toHaveBeenCalled();

      dispose();
    });
  });
});

describe("ticket-detail-state cancelFileSwitch clears pendingTab", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ content: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })),
    ) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("cancel tab switch then proceed file switch stays on editor tab", () => {
    createRoot((dispose) => {
      const ticket = makeTicketInfo();
      const ctrl = createTicketDetailState({
        ticket,
        projectSlug: "my-project",
        onClose: vi.fn(),
      });

      ctrl.setContent("unsaved edit");

      expect(ctrl.hasUnsavedFileChanges()).toBe(true);
      expect(ctrl.activeTab()).toBe("editor");

      ctrl.switchTab("launcher");

      expect(ctrl.confirmingFileSwitch()).toBe(true);
      expect(ctrl.activeTab()).toBe("editor");

      ctrl.cancelFileSwitch();

      expect(ctrl.confirmingFileSwitch()).toBe(false);

      const targetFile = { type: "context" as const, name: "product-requirement-document" };
      ctrl.selectFile(targetFile);

      expect(ctrl.confirmingFileSwitch()).toBe(true);

      ctrl.proceedFileSwitch();

      expect(ctrl.activeTab()).toBe("editor");
      expect(ctrl.activeFile()).toEqual(targetFile);

      dispose();
    });
  });
});
