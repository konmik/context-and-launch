import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "~/test-render.js";
import { createSignal, createRoot, createMemo } from "solid-js";
import TicketDetailDialog from "./TicketDetailDialog";
import {
  createTicketDetailState, type TicketDetailStateDeps,
} from "./ticket-detail-state.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import { createStoredSignal } from '~/util/stored-signal.js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';

const mockGetContext = vi.fn().mockResolvedValue({ content: "" });
const mockUpdateTicket = vi.fn();
const mockDeleteContext = vi.fn().mockResolvedValue({ ok: true });
const mockUploadFile = vi.fn().mockResolvedValue({ ok: true, results: [] });
const emptyTicketFiles = { contextNames: [], fileNames: [], references: [] };
const mockGetTicketFiles = vi.fn().mockResolvedValue(emptyTicketFiles);
const [worktreeRevision, setWorktreeRevision] = createSignal(0);
const mockGetMergedLauncherConfig = vi.fn().mockResolvedValue({
  projectConfig: { templates: [], skills: [] },
  templates: [], skills: [], profiles: [], shortcuts: [],
  columnDefaults: {}, worktreeRootPath: null,
  conflictResolutionPrompt: "",
  projectBoardId: null, projectName: "",
  projectPath: "", worktreeDir: "", agentWorktreeDir: "",
});

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

function stateDependencies(ticket: TicketInfo): TicketDetailStateDeps {
	const initial = createMemo(async () => (await mockGetMergedLauncherConfig()).projectConfig);
  let saved = ticket;
  const ticketStatus = createStoredSignal(() => saved, async transform => {
    saved = transform(saved);
    mockUpdateTicket(saved);
    return { type: 'Success', value: saved };
  });
  return {
    ticketStatus: {
      ...ticketStatus,
      refresh: async () => {
        const files = await mockGetTicketFiles("test-project", saved.folderName);
        return ticketStatus.update(current => ({ ...current, ...files }));
      },
    },
    sharedConfig: createStoredSignal(() => emptyConfig, async transform => ({
      type: 'Success', value: transform(emptyConfig),
    })),
    worktreeRevision,
    getContext: mockGetContext,
    saveContext: async () => ({ ok: true }),
    deleteContext: mockDeleteContext,
    deleteFile: async () => ({ ok: true }),
    uploadFile: mockUploadFile,
    getProjectLauncherMetadata: mockGetMergedLauncherConfig,
    projectConfig: createStoredSignal(initial, async transform => ({ type: 'Success', value: transform(initial()) })),
    openNativeFileBrowser: async () => [],
  };
}

function renderTicket(ticket: TicketInfo) {
  const stateDeps = stateDependencies(ticket);
  return render(() => (
    <TicketDetailDialog
      onClose={() => {}}
      projectSlug="test-project"
      ticket={ticket}
      stateDeps={stateDeps}
    />
  ));
}

async function expectEditorText(text: string) {
  await waitFor(() => expect(document.querySelector(".cm-content")?.textContent).toBe(text));
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

    renderTicket(ticket);

    await flush();
    await flush();
    await expectEditorText("Hello World");
  });

  it("a slow context load does not clobber a newer image selection", async () => {
    let resolveContext!: (value: { content: string }) => void;
    mockGetContext.mockImplementation(
      () => new Promise((resolve) => { resolveContext = resolve; }),
    );
    const ticket = { ...makeTicket("t-1-alpha", "T-1", "Alpha"), fileNames: ["shot.png"] };

    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTicketDetailState(
        { projectSlug: "test-project", onClose: () => {} },
        stateDependencies(ticket),
      ),
      dispose: disposeRoot,
    }));
    try {
      expect(state.fileView().kind).toBe("loading");
      state.selectFile({ type: "file", name: "shot.png" });
      await flush();
      expect(state.fileView().kind).toBe("image");
      resolveContext({ content: "description text" });
      await flush();
      expect(state.fileView().kind).toBe("image");
      expect(state.content()).toBe("");
    } finally {
      dispose();
    }
  });
});

describe("TicketDetailDialog external worktree changes", () => {
  afterEach(() => {
    cleanup();
    setWorktreeRevision(0);
    mockGetContext.mockResolvedValue({ content: "" });
  });

  async function changeWorktree() {
    setWorktreeRevision((revision) => revision + 1);
    await flush();
    await flush();
  }

  it("reloads the open markdown file when the worktree changes underneath it", async () => {
    mockGetContext.mockResolvedValue({ content: "written by me" });

    renderTicket(makeTicket("t-1-alpha", "T-1", "Alpha"));
    await flush();
    await flush();
    await expectEditorText("written by me");

    mockGetContext.mockResolvedValue({ content: "written by the agent" });
    await changeWorktree();

    await expectEditorText("written by the agent");
  });

  it("keeps unsaved edits and refuses to save over an external change", async () => {
    mockGetContext.mockResolvedValue({ content: "original" });
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTicketDetailState(
        { projectSlug: "test-project", onClose: () => {} },
        stateDependencies(ticket),
      ),
      dispose: disposeRoot,
    }));
    try {
      await flush();
      state.setContent("my unsaved edit");

      mockGetContext.mockResolvedValue({ content: "written by the agent" });
      await changeWorktree();

      expect(state.content()).toBe("my unsaved edit");
      expect(state.externallyChanged()).toBe(true);

      await state.saveAll();
      expect(state.confirmingExternalChange()).toBe(true);

      state.discardExternalChange();
      await flush();
      expect(state.content()).toBe("written by the agent");
      expect(state.externallyChanged()).toBe(false);
    } finally {
      dispose();
    }
  });

  it("keeps editing when the worktree changes but the open file did not", async () => {
    mockGetContext.mockResolvedValue({ content: "original" });
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    const { state, dispose } = createRoot((disposeRoot) => ({
      state: createTicketDetailState(
        { projectSlug: "test-project", onClose: () => {} },
        stateDependencies(ticket),
      ),
      dispose: disposeRoot,
    }));
    try {
      await flush();
      state.setContent("my unsaved edit");

      await changeWorktree();

      expect(state.content()).toBe("my unsaved edit");
      expect(state.externallyChanged()).toBe(false);

      await state.saveAll();
      expect(state.confirmingExternalChange()).toBe(false);
    } finally {
      dispose();
    }
  });

  it("does not blank the editor while a background reload is in flight", async () => {
    mockGetContext.mockResolvedValue({ content: "original" });

    renderTicket(makeTicket("t-1-alpha", "T-1", "Alpha"));
    await flush();
    await flush();

    let resolveContext!: (value: { content: string }) => void;
    mockGetContext.mockImplementation(
      () => new Promise((resolve) => { resolveContext = resolve; }),
    );
    setWorktreeRevision((revision) => revision + 1);
    await flush();

    await expectEditorText("original");

    resolveContext({ content: "refreshed" });
    await flush();
    await expectEditorText("refreshed");
    mockGetContext.mockResolvedValue({ content: "" });
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

    renderTicket(ticket);

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

    renderTicket(ticket);

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

    renderTicket(ticket);

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
    renderTicket(makeTicket("t-1-alpha", "T-1", "Alpha"));
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

    renderTicket(ticket);

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

    const currentLabel = screen.getByText("description.md");
    fireEvent.click(currentLabel);
    await flush();

    const optionsAfterDelete = screen.getAllByRole("button").map((b) => b.textContent);
    expect(optionsAfterDelete.some((t) => t?.includes("ghost-doc.md"))).toBe(false);
  });
});

describe('TicketDetailDialog shared launcher state', () => {
  it('reflects project storage changes in every open consumer', async () => {
    const ticket = makeTicket('t-1-alpha', 'T-1', 'Alpha');
    const { states, setProject, dispose } = createRoot(dispose => {
      const [project, setProject] = createSignal<LauncherConfig>({
        ...emptyConfig, profiles: [{ name: 'before', command: 'before' }],
      });
      const deps = {
        ...stateDependencies(ticket),
        projectConfig: createStoredSignal(project,
          async transform => ({ type: 'Success', value: transform(project()) })),
      };
      const states = [0, 1].map(() => createTicketDetailState({
        projectSlug: 'test-project', onClose: () => {},
      }, deps));
      return { states, setProject, dispose };
    });
    try {
      await waitFor(() => expect(states.map(state => state.launcherConfig()?.profiles[0].name))
        .toEqual(['before', 'before']));
      setProject({ ...emptyConfig, profiles: [{ name: 'after', command: 'after' }] });
      await waitFor(() => expect(states.map(state => state.launcherConfig()?.profiles[0].name))
        .toEqual(['after', 'after']));
    } finally { dispose(); }
  });

  it('reacts to shared edits while retaining project overrides without reloading project data', async () => {
    const ticket = makeTicket('t-1-alpha', 'T-1', 'Alpha');
    const readProject = vi.fn(async () => ({
      projectConfig: { templates: [], skills: [], profiles: [{ name: 'overridden', command: 'project' }] },
      projectBoardId: null, projectName: '', projectPath: '', worktreeDir: '', agentWorktreeDir: '',
    }));
    const { state, sharedConfig, dispose } = createRoot(dispose => {
      let saved: LauncherConfig = { ...emptyConfig, profiles: [{ name: 'overridden', command: 'shared' }] };
      const sharedConfig = createStoredSignal(() => saved, async transform => {
        saved = transform(saved);
        return { type: 'Success', value: saved };
      });
      const state = createTicketDetailState({ projectSlug: 'test-project', onClose: () => {} }, {
        ...stateDependencies(ticket), sharedConfig,
        projectConfig: createStoredSignal(createMemo(async () => (await readProject()).projectConfig),
          async transform => ({ type: 'Success', value: transform((await readProject()).projectConfig) })),
      });
      return { state, sharedConfig, dispose };
    });
    try {
      await waitFor(() => expect(state.launcherConfig()?.profiles[0].command).toBe('project'));
      await sharedConfig.update(current => ({
        ...current, profiles: [{ name: 'overridden', command: 'changed' }, { name: 'new', command: 'new' }],
      }));
      await waitFor(() => expect(state.launcherConfig()?.profiles.map(profile => profile.command))
        .toEqual(['project', 'new']));
      expect(readProject).toHaveBeenCalledTimes(1);
    } finally { dispose(); }
  });
});

describe("TicketDetailDialog initial tab", () => {
  afterEach(() => {
    cleanup();
    mockGetMergedLauncherConfig.mockResolvedValue({
      projectConfig: emptyConfig,
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

    renderTicket(ticket);

    expect(screen.getByTestId("ticket-detail-number-input")).toBeTruthy();
  });

  it("shows the configured tab at start without flashing the editor first", async () => {
    mockGetMergedLauncherConfig.mockResolvedValue({
      ...emptyConfig,
      projectConfig: {
        ...emptyConfig,
        columnDefaults: { todo: { lastLayer: 'launcher', templateName: null, checkedSkills: [], profileName: null } },
      },
      shortcuts: [],
      worktreeRootPath: null,
      conflictResolutionPrompt: "",
      projectBoardId: null, projectName: "",
      projectPath: "", worktreeDir: "", agentWorktreeDir: "",
      columnDefaults: { todo: { lastLayer: "launcher" } },
    });

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    renderTicket(ticket);

    await flush();
    await flush();

    expect(screen.getByTestId("ticket-detail-launcher-profile-select")).toBeTruthy();
    expect(screen.queryByText("Drop a file to copy")).toBeNull();
  });
});

describe("TicketDetailDialog editable title", () => {
  beforeEach(() => {
    mockUpdateTicket.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  function inputByTestId(testId: string): HTMLInputElement {
    const input = screen.getByTestId(testId);
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Expected ${testId} to be an input element`);
    }
    return input;
  }

  it("Save button appears and saves header changes", async () => {
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    renderTicket(ticket);

    await flush();
    await flush();

    const titleInput = inputByTestId("ticket-detail-title-input");
    fireEvent.input(titleInput, { target: { value: "Beta" } });
    await flush();

    fireEvent.click(screen.getByTestId("ticket-detail-save-button"));
    await flush();

    expect(mockUpdateTicket).toHaveBeenCalledWith(expect.objectContaining({ title: "Beta" }));
  });

  it("Escape after save reverts to saved value, not original prop", async () => {
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    renderTicket(ticket);

    await flush();
    await flush();

    const titleInput = inputByTestId("ticket-detail-title-input");
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

    renderTicket(ticket);

    await flush();
    await flush();

    const titleInput = inputByTestId("ticket-detail-title-input");
    fireEvent.input(titleInput, { target: { value: "Changed" } });
    fireEvent.keyDown(titleInput, { key: "Escape" });
    await flush();
    expect(titleInput.value).toBe("Alpha");

    const numberInput = inputByTestId("ticket-detail-number-input");
    fireEvent.input(numberInput, { target: { value: "X-9" } });
    fireEvent.keyDown(numberInput, { key: "Escape" });
    await flush();
    expect(numberInput.value).toBe("T-1");

    expect(mockUpdateTicket).not.toHaveBeenCalled();
  });
});
