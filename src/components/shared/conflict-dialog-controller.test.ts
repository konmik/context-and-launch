import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import {
  createConflictDialogController,
  type ConflictDialogDeps,
} from "./conflict-dialog-controller.js";

function makeDeps(overrides?: Partial<ConflictDialogDeps>): ConflictDialogDeps {
  return {
    projectSlug: () => "test-project",
    open: () => true,
    onResolve: async () => {},
    onAbort: async () => {},
    onOpenChange: () => {},
    ...overrides,
  };
}

interface MockFetchOptions {
  profiles?: { name: string }[];
  lastUsedProfile?: string | null;
  lastUsedOk?: boolean;
  putOk?: boolean;
  putError?: string;
}

function stubFetch(options: MockFetchOptions = {}) {
  const {
    profiles = [],
    lastUsedProfile = null,
    lastUsedOk = true,
    putOk = true,
    putError,
  } = options;
  const putCalls: { profileName: string }[] = [];
  const mockFetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith("/launcher-config")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ profiles }),
      });
    }
    if (url === "/api/last-used-profile") {
      if (init?.method === "PUT") {
        putCalls.push(JSON.parse(init.body as string));
        return Promise.resolve({
          ok: putOk,
          json: () => Promise.resolve(putError ? { error: putError } : {}),
        });
      }
      return Promise.resolve({
        ok: lastUsedOk,
        json: () => Promise.resolve({ profileName: lastUsedProfile }),
      });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  });
  vi.stubGlobal("fetch", mockFetch);
  return { mockFetch, putCalls };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("createConflictDialogController", () => {
  it("close calls onOpenChange(false) and clears error", () => {
    createRoot((dispose) => {
      let openChangedTo: boolean | undefined;
      const ctrl = createConflictDialogController(makeDeps({
        onOpenChange: (open) => { openChangedTo = open; },
      }));
      ctrl.close();
      expect(openChangedTo).toBe(false);
      expect(ctrl.errorMsg()).toBe("");
      dispose();
    });
  });

  it("resolve calls onResolve with selected profile", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [{ name: "fast" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      let resolvedProfile = "";
      let closed = false;
      const ctrl = createConflictDialogController(makeDeps({
        onResolve: async (profileName) => { resolvedProfile = profileName; },
        onOpenChange: (open) => { if (!open) closed = true; },
      }));
      ctrl.setSelectedProfile("fast");
      await ctrl.resolve();
      expect(resolvedProfile).toBe("fast");
      expect(closed).toBe(true);
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("resolve sets errorMsg when onResolve throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps({
        onResolve: async () => { throw new Error("Failed to launch resolver"); },
      }));
      await ctrl.resolve();
      expect(ctrl.errorMsg()).toBe("Failed to launch resolver");
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("abort calls onAbort and closes on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      let aborted = false;
      let closed = false;
      const ctrl = createConflictDialogController(makeDeps({
        onAbort: async () => { aborted = true; },
        onOpenChange: (open) => { if (!open) closed = true; },
      }));
      await ctrl.abort();
      expect(aborted).toBe(true);
      expect(closed).toBe(true);
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("abort sets errorMsg when onAbort throws", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ profiles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps({
        onAbort: async () => { throw new Error("Abort failed"); },
      }));
      await ctrl.abort();
      expect(ctrl.errorMsg()).toBe("Abort failed");
      expect(ctrl.submitting()).toBe(false);
      dispose();
    });
  });

  it("profiles are initially empty", () => {
    createRoot((dispose) => {
      const ctrl = createConflictDialogController(makeDeps({
        open: () => false,
      }));
      expect(ctrl.profiles()).toEqual([]);
      dispose();
    });
  });

  it("pre-selects the global last-used profile when present in the list", async () => {
    stubFetch({
      profiles: [{ name: "fast" }, { name: "slow" }],
      lastUsedProfile: "slow",
    });

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps());
      await flush();
      expect(ctrl.selectedProfile()).toBe("slow");
      dispose();
    });
  });

  it("falls back to the first profile when the global pref is absent", async () => {
    stubFetch({
      profiles: [{ name: "fast" }, { name: "slow" }],
      lastUsedProfile: null,
    });

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps());
      await flush();
      expect(ctrl.selectedProfile()).toBe("fast");
      dispose();
    });
  });

  it("falls back to the first profile when the global pref is stale (not in list)", async () => {
    stubFetch({
      profiles: [{ name: "fast" }, { name: "slow" }],
      lastUsedProfile: "deleted-profile",
    });

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps());
      await flush();
      expect(ctrl.selectedProfile()).toBe("fast");
      expect(ctrl.errorMsg()).toBe("");
      dispose();
    });
  });

  it("falls back to the first profile when the global pref load fails", async () => {
    stubFetch({
      profiles: [{ name: "fast" }, { name: "slow" }],
      lastUsedOk: false,
    });

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps());
      await flush();
      expect(ctrl.selectedProfile()).toBe("fast");
      expect(ctrl.errorMsg()).toBe("");
      dispose();
    });
  });

  it("selectProfile issues a PUT to persist the global pref", async () => {
    const { putCalls } = stubFetch({
      profiles: [{ name: "fast" }, { name: "slow" }],
    });

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps());
      await flush();
      await ctrl.selectProfile("slow");
      expect(ctrl.selectedProfile()).toBe("slow");
      expect(putCalls).toEqual([{ profileName: "slow" }]);
      dispose();
    });
  });

  it("stale-in-memory-selection-after-profile-deleted: reopen reconciles against the new list", async () => {
    let currentProfiles: { name: string }[] = [{ name: "Claude" }, { name: "Codex" }];
    const mockFetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/launcher-config")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ profiles: currentProfiles }),
        });
      }
      if (url === "/api/last-used-profile") {
        if (init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ profileName: null }) });
      }
      throw new Error(`unexpected fetch url: ${url}`);
    });
    vi.stubGlobal("fetch", mockFetch);

    await createRoot(async (dispose) => {
      const [open, setOpen] = createSignal(true);
      const ctrl = createConflictDialogController(makeDeps({ open }));
      await flush();
      await ctrl.selectProfile("Codex");
      expect(ctrl.selectedProfile()).toBe("Codex");

      setOpen(false);
      currentProfiles = [{ name: "Claude" }];
      setOpen(true);
      await flush();

      expect(ctrl.profiles().map((p) => p.name)).toEqual(["Claude"]);
      expect(ctrl.selectedProfile()).toBe("Claude");
      dispose();
    });
  });

  it("selectProfile surfaces a failed PUT in errorMsg", async () => {
    stubFetch({
      profiles: [{ name: "fast" }, { name: "slow" }],
      putOk: false,
      putError: "boom",
    });

    await createRoot(async (dispose) => {
      const ctrl = createConflictDialogController(makeDeps());
      await flush();
      await ctrl.selectProfile("slow");
      expect(ctrl.selectedProfile()).toBe("slow");
      expect(ctrl.errorMsg()).toBe("boom");
      dispose();
    });
  });
});
