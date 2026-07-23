import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@solidjs/testing-library";

vi.mock("@solidjs/router", async () => {
  const { createSignal, createEffect } = await import("solid-js");
  const queryVersions = new Map<string, { track: () => number; bump: () => void }>();
  function versionFor(queryKey: string) {
    let entry = queryVersions.get(queryKey);
    if (!entry) {
      const [track, setVersion] = createSignal(0);
      entry = { track, bump: () => setVersion((v) => v + 1) };
      queryVersions.set(queryKey, entry);
    }
    return entry;
  }
  return {
    revalidate: vi.fn(async (keyOrKeys: string | string[]) => {
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
      for (const queryKey of keys) queryVersions.get(queryKey)?.bump();
    }),
    action: (fn: Function) => fn,
    query: (fn: Function, queryKey: string) => (...args: unknown[]) => {
      versionFor(queryKey).track();
      return fn(...args);
    },
    createAsync: (
      fn: () => Promise<unknown>,
      options?: { initialValue?: unknown },
    ) => {
      const [value, setValue] = createSignal(options?.initialValue);
      createEffect(() => {
        Promise.resolve(fn()).then((v) => setValue(() => v));
      });
      const accessor = () => value();
      Object.defineProperty(accessor, "latest", { get: () => value() });
      return accessor;
    },
  };
});

const mockGetContext = vi.fn().mockResolvedValue({ content: "" });
const mockUpdateTicket = vi.fn().mockResolvedValue({ ok: true, folderName: "test" });
const mockDeleteContext = vi.fn().mockResolvedValue({ ok: true });
const mockUploadFile = vi.fn().mockResolvedValue({ ok: true, results: [] });
const emptyTicketFiles = { contextNames: [], fileNames: [], references: [] };
const mockGetTicketFiles = vi.fn().mockResolvedValue(emptyTicketFiles);
const mockGetMergedLauncherConfig = vi.fn().mockResolvedValue({
  templates: [], skills: [], profiles: [], shortcuts: [],
  columnDefaults: {}, worktreeRootPath: null,
  conflictResolutionPrompt: "",
  projectBoardId: null, projectName: "",
  projectPath: "", worktreeDir: "", agentWorktreeDir: "",
});

vi.mock("./ticket-api.js", async () => {
  const { query } = await import("@solidjs/router");
  return {
    getTicketFiles: query(
      (...args: unknown[]) => mockGetTicketFiles(...args), "ticket-files",
    ),
    getContext: (...args: unknown[]) => mockGetContext(...args),
    saveContext: vi.fn().mockResolvedValue({ ok: true }),
    deleteContext: (...args: unknown[]) => mockDeleteContext(...args),
    deleteFile: vi.fn().mockResolvedValue({ ok: true }),
    removeReference: vi.fn().mockResolvedValue({ ok: true }),
    setUseWorktree: vi.fn().mockResolvedValue({ ok: true }),
    addReferences: vi.fn().mockResolvedValue({ ok: true }),
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    createTicket: vi.fn().mockResolvedValue({ ok: true }),
    updateTicket: (...args: unknown[]) => mockUpdateTicket(...args),
    deleteTicket: vi.fn().mockResolvedValue({ ok: true }),
    archiveTicket: vi.fn().mockResolvedValue({ ok: true }),
    reorderTicket: vi.fn().mockResolvedValue({ ok: true }),
    syncTickets: vi.fn().mockResolvedValue({ ok: true }),
    getSyncPending: vi.fn().mockResolvedValue(false),
    worktreeCleanup: vi.fn().mockResolvedValue({ ok: true }),
  };
});

vi.mock("../launcher/launcher-api.js", () => ({
  getMergedLauncherConfig: (...args: unknown[]) => mockGetMergedLauncherConfig(...args),
  saveColumnDefaults: vi.fn().mockResolvedValue({ ok: true }),
  launchAgentAction: vi.fn().mockResolvedValue({ ok: true }),
  runShortcut: vi.fn().mockResolvedValue({ ok: true }),
  getLastUsedProfile: vi.fn().mockResolvedValue(null),
  saveLastUsedProfile: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../shared/shared-api.js", () => ({
  openNativeFileBrowser: vi.fn().mockResolvedValue([]),
  openConfigDir: vi.fn().mockResolvedValue(undefined),
  pickDirectory: vi.fn().mockResolvedValue({ cancelled: true }),
}));

vi.mock("../shared/MarkdownEditor", () => ({
  default: (props: { value: string }) => (
    <div data-testid="editor-content">{props.value}</div>
  ),
}));

vi.mock("../launcher/AgentLauncher", () => ({
  default: () => <div data-testid="agent-launcher" />,
}));

vi.mock("../ui/floating-panel", () => ({
  FloatingWindow: (props: any) => <div data-testid="floating-panel">{props.children}</div>,
  FloatingWindowHeader: (props: any) => <div>{props.title}{props.actions}{props.children}</div>,
  FloatingPanelBody: (props: any) => <div>{props.children}</div>,
  FLOATING_WINDOW_MIN_SIZE: { width: 400, height: 300 },
  tallWindowDefaultSize: () => ({ width: 768, height: 640 }),
}));


import { createSignal, createRoot } from "solid-js";
import TicketDetailDialog from "./TicketDetailDialog";
import { createTicketDetailState } from "./ticket-detail-state.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

function makeTicket(folder: string, number: string, title: string): TicketInfo {
  return {
    number,
    title,
    status: "todo",
    folderName: folder,
    contextNames: [],
    useWorktree: false,
    hasAgentWorktree: false,
    fileNames: [],
    references: [],
  };
}

const emptyConfig = { templates: [], skills: [], profiles: [], columnDefaults: {} };

interface DeferredFetch {
  resolve: (body: object, status?: number) => void;
  reject: (error: Error) => void;
}

function createFetchController() {
  const pending: DeferredFetch[] = [];

  const mockFetch = vi.fn(
    (_url: string, _opts?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        pending.push({
          resolve: (body: object, status = 200) =>
            resolve(
              new Response(JSON.stringify(body), {
                status,
                headers: { "Content-Type": "application/json" },
              })
            ),
          reject: (error: Error) => reject(error),
        });
      })
  );

  return { mockFetch, pending };
}

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

describe("TicketDetailDialog content loading", () => {
  afterEach(() => {
    cleanup();
    mockGetContext.mockResolvedValue({ content: "" });
  });

  it("loads and displays context content for a ticket", async () => {
    mockGetContext.mockResolvedValue({ content: "Hello World" });

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();
    expect(screen.getByTestId("editor-content").textContent).toBe("Hello World");
  });

  it("a slow context load does not clobber a newer image selection", async () => {
    let resolveContext!: (value: { content: string }) => void;
    mockGetContext.mockImplementation(
      () => new Promise((resolve) => { resolveContext = resolve; }),
    );
    const ticket = { ...makeTicket("t-1-alpha", "T-1", "Alpha"), fileNames: ["shot.png"] };

    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTicketDetailState({ ticket, projectSlug: "test-project", onClose: () => {} }),
      dispose: disposeRoot,
    }));
    try {
      expect(state.fileView().kind).toBe("loading");
      state.selectFile({ type: "file", name: "shot.png" });
      await flush();
      expect(state.fileView().kind).toBe("image");
      resolveContext({ content: "to-do text" });
      await flush();
      expect(state.fileView().kind).toBe("image");
      expect(state.content()).toBe("");
    } finally {
      dispose();
    }
  });
});

describe("TicketDetailDialog multi-file upload confirmation", () => {
  beforeEach(() => {
    mockUploadFile.mockClear();
    mockUploadFile.mockResolvedValue({ ok: true, results: [] });
  });

  afterEach(() => {
    cleanup();
    mockGetTicketFiles.mockReset();
    mockGetTicketFiles.mockResolvedValue(emptyTicketFiles);
  });

  function makeLargeFile(name: string, sizeBytes: number): File {
    const buffer = new ArrayBuffer(sizeBytes);
    return new File([buffer], name, { type: "application/octet-stream" });
  }

  it("processes each large file's size confirmation sequentially without overwriting", async () => {
    let uploadResolve: ((v: any) => void) | null = null;
    mockUploadFile.mockImplementation(() =>
      new Promise((resolve) => { uploadResolve = resolve; })
    );

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const file1 = makeLargeFile("big1.dat", 20000);
    const file2 = makeLargeFile("big2.dat", 30000);

    const dropButton = screen.getByText("Drop a file to copy");
    fireEvent.drop(dropButton, { dataTransfer: { files: [file1, file2], length: 2 } });
    await flush();

    expect(screen.getByText(/big1\.dat/)).toBeTruthy();
    expect(screen.queryByText(/big2\.dat/)).toBeNull();

    const copyAnywayButton = screen.getByText("Copy Anyway");
    fireEvent.click(copyAnywayButton);
    await flush();

    expect(mockUploadFile).toHaveBeenCalledTimes(1);

    uploadResolve!({ ok: true, results: [{ ok: true, name: "big1.dat" }] });
    await flush();

    expect(screen.getByText(/big2\.dat/)).toBeTruthy();
  });

  it("cancelling first file lets second file show its confirmation", async () => {
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const file1 = makeLargeFile("large1.dat", 20000);
    const file2 = makeLargeFile("large2.dat", 30000);

    const dropButton = screen.getByText("Drop a file to copy");
    fireEvent.drop(dropButton, {
      dataTransfer: { files: [file1, file2], length: 2 },
    });
    await flush();

    expect(screen.getByText(/large1\.dat/)).toBeTruthy();

    const fileText = screen.getByText(/large1\.dat/);
    const dialogContent = fileText.closest("[data-state='open']")!;
    const cancelButton = dialogContent.querySelector("button")!;
    fireEvent.click(cancelButton);
    await flush();

    expect(screen.getByText(/large2\.dat/)).toBeTruthy();
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("processes overwrite confirmations sequentially for multiple existing files", async () => {
    let uploadResolve: ((v: any) => void) | null = null;
    mockUploadFile.mockImplementation(() =>
      new Promise((resolve) => { uploadResolve = resolve; })
    );

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");
    ticket.fileNames = ["exist1.txt", "exist2.txt"];
    mockGetTicketFiles.mockResolvedValue({
      contextNames: [], fileNames: ["exist1.txt", "exist2.txt"], references: [],
    });

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const file1 = new File(["hello"], "exist1.txt", { type: "text/plain" });
    const file2 = new File(["world"], "exist2.txt", { type: "text/plain" });

    const dropButton = screen.getByText("Drop a file to copy");
    fireEvent.drop(dropButton, {
      dataTransfer: { files: [file1, file2], length: 2 },
    });
    await flush();

    expect(screen.getByText(/exist1\.txt/)).toBeTruthy();
    expect(screen.getByText("Overwrite File")).toBeTruthy();

    const overwriteButton = screen.getByText("Overwrite");
    fireEvent.click(overwriteButton);
    await flush();

    expect(mockUploadFile).toHaveBeenCalledTimes(1);

    uploadResolve!({ ok: true, results: [{ ok: true, name: "exist1.txt" }] });
    await flush();

    expect(screen.getByText(/exist2\.txt/)).toBeTruthy();
    expect(screen.getByText("Overwrite File")).toBeTruthy();
  });
});

describe("TicketDetailDialog file list refresh after upload", () => {
  beforeEach(() => {
    mockUploadFile.mockClear();
  });

  afterEach(() => {
    cleanup();
    mockGetTicketFiles.mockReset();
    mockGetTicketFiles.mockResolvedValue(emptyTicketFiles);
  });

  async function renderAndDrop(file: File) {
    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={makeTicket("t-1-alpha", "T-1", "Alpha")}
      />
    ));
    await flush();
    await flush();

    fireEvent.drop(screen.getByText("Drop a file to copy"), {
      dataTransfer: { files: [file], length: 1 },
    });
    await flush();
    await flush();
  }

  async function dropdownOptionLabels(): Promise<(string | null)[]> {
    fireEvent.click(screen.getByTestId("ticket-detail-editor-file-dropdown-trigger"));
    await flush();
    return screen
      .getAllByTestId("ticket-detail-editor-file-dropdown-option")
      .map((el) => el.textContent);
  }

  it("a dropped .md file appears in the file dropdown immediately", async () => {
    mockGetTicketFiles.mockResolvedValue(emptyTicketFiles);
    mockUploadFile.mockImplementation(async () => {
      mockGetTicketFiles.mockResolvedValue({
        contextNames: ["notes"], fileNames: ["notes.md"], references: [],
      });
      return { ok: true, results: [{ ok: true, name: "notes.md" }] };
    });

    await renderAndDrop(new File(["# Notes"], "notes.md", { type: "text/markdown" }));

    const options = await dropdownOptionLabels();
    expect(options.some((t) => t?.includes("notes.md"))).toBe(true);
  });

  it("a dropped non-markdown file appears in the file dropdown immediately", async () => {
    mockGetTicketFiles.mockResolvedValue(emptyTicketFiles);
    mockUploadFile.mockImplementation(async () => {
      mockGetTicketFiles.mockResolvedValue({
        contextNames: [], fileNames: ["report.txt"], references: [],
      });
      return { ok: true, results: [{ ok: true, name: "report.txt" }] };
    });

    await renderAndDrop(new File(["data"], "report.txt", { type: "text/plain" }));

    const options = await dropdownOptionLabels();
    expect(options.some((t) => t?.includes("report.txt"))).toBe(true);
  });
});

describe("TicketDetailDialog context deletion clears extraFiles", () => {
  afterEach(() => {
    cleanup();
    mockGetContext.mockResolvedValue({ content: "" });
    mockDeleteContext.mockResolvedValue({ ok: true });
  });

  it("deleting a context added via New markdown file removes it from the dropdown", async () => {
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const newFileButton = screen.getByText("New markdown file");
    fireEvent.click(newFileButton);
    await flush();

    const input = screen.getByPlaceholderText("e.g. design-notes");
    fireEvent.input(input, { target: { value: "ghost-doc" } });
    await flush();

    const createButton = screen.getByText("Create");
    fireEvent.click(createButton);
    await flush();
    await flush();

    const dropdownButton = screen.getByText("ghost-doc.md");
    fireEvent.click(dropdownButton);
    await flush();

    const dropdownOptions = screen.getAllByRole("button").map((b) => b.textContent);
    expect(dropdownOptions.some((t) => t?.includes("ghost-doc.md"))).toBe(true);

    fireEvent.click(dropdownButton);
    await flush();

    const trashButton = screen.getByTitle("Delete file");
    fireEvent.click(trashButton);
    await flush();

    const deleteButton = screen.getByText("Delete");
    fireEvent.click(deleteButton);
    await flush();
    await flush();

    const currentLabel = screen.getByText("to-do.md");
    fireEvent.click(currentLabel);
    await flush();

    const optionsAfterDelete = screen.getAllByRole("button").map((b) => b.textContent);
    expect(optionsAfterDelete.some((t) => t?.includes("ghost-doc.md"))).toBe(false);
  });
});

describe("TicketDetailDialog initial tab", () => {
  afterEach(() => {
    cleanup();
    mockGetMergedLauncherConfig.mockResolvedValue({
      templates: [], skills: [], profiles: [], shortcuts: [],
      columnDefaults: {}, worktreeRootPath: null,
      conflictResolutionPrompt: "",
      projectBoardId: null, projectName: "",
      projectPath: "", worktreeDir: "", agentWorktreeDir: "",
    });
  });

  it("shows the ticket window without waiting for Launcher Config", () => {
    mockGetMergedLauncherConfig.mockReturnValue(new Promise(() => {}));
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    expect(screen.getByTestId("ticket-detail-number-input")).toBeTruthy();
  });

  it("shows the configured tab at start without flashing the editor first", async () => {
    mockGetMergedLauncherConfig.mockResolvedValue({
      ...emptyConfig,
      shortcuts: [],
      worktreeRootPath: null,
      conflictResolutionPrompt: "",
      projectBoardId: null, projectName: "",
      projectPath: "", worktreeDir: "", agentWorktreeDir: "",
      columnDefaults: { todo: { lastLayer: "launcher" } },
    });

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    expect(screen.getByTestId("agent-launcher")).toBeTruthy();
    expect(screen.queryByText("Drop a file to copy")).toBeNull();
  });
});

describe("TicketDetailDialog editable title", () => {
  beforeEach(() => {
    mockUpdateTicket.mockClear();
    mockUpdateTicket.mockResolvedValue({ ok: true, folderName: "test" });
  });

  afterEach(() => {
    cleanup();
  });

  it("Save button appears and saves header changes", async () => {
    mockUpdateTicket.mockResolvedValue({ ok: true, folderName: "t-1-alpha" });

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const titleInput = screen.getByTestId("ticket-detail-title-input") as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: "Beta" } });
    await flush();

    fireEvent.click(screen.getByTestId("ticket-detail-save-button"));
    await flush();

    expect(mockUpdateTicket).toHaveBeenCalledWith(
      "test-project", "t-1-alpha", null, "Beta", null,
    );
  });

  it("Escape after save reverts to saved value, not original prop", async () => {
    mockUpdateTicket.mockResolvedValue({ ok: true, folderName: "t-1-beta" });

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const titleInput = screen.getByTestId("ticket-detail-title-input") as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: "Beta" } });
    await flush();

    fireEvent.click(screen.getByTestId("ticket-detail-save-button"));
    await flush();
    await flush();

    fireEvent.input(titleInput, { target: { value: "Gamma" } });
    await flush();
    fireEvent.keyDown(titleInput, { key: "Escape" });
    await flush();

    expect(titleInput.value).toBe("Beta");
  });

  it("Escape reverts inputs without saving", async () => {
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    await flush();

    const titleInput = screen.getByTestId("ticket-detail-title-input") as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: "Changed" } });
    fireEvent.keyDown(titleInput, { key: "Escape" });
    await flush();
    expect(titleInput.value).toBe("Alpha");

    const numberInput = screen.getByTestId("ticket-detail-number-input") as HTMLInputElement;
    fireEvent.input(numberInput, { target: { value: "X-9" } });
    fireEvent.keyDown(numberInput, { key: "Escape" });
    await flush();
    expect(numberInput.value).toBe("T-1");

    expect(mockUpdateTicket).not.toHaveBeenCalled();
  });
});
