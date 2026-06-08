import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  revalidate: vi.fn(),
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
  FloatingPanelRoot: (props: any) => <div data-testid="floating-panel">{props.children}</div>,
  FloatingPanelHeader: (props: any) => <div>{props.children}</div>,
  FloatingPanelBody: (props: any) => <div>{props.children}</div>,
  FloatingPanelDragTrigger: (props: any) => <div>{props.children}</div>,
  FloatingPanelResizeTrigger: () => null,
  FloatingPanelTitle: (props: any) => <h2>{props.children}</h2>,
}));


import { createSignal } from "solid-js";
import TicketDetailDialog from "./TicketDetailDialog";
import type { TicketInfo } from "~/server/ticket/ticket-store.js";

function makeTicket(folder: string, number: string, title: string): TicketInfo {
  return {
    number,
    title,
    status: "todo",
    folderName: folder,
    contextNames: [],
    useWorktree: false,
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
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("does not show stale content when ticket changes before fetch completes", async () => {
    const docFetches: Array<{ url: string; resolve: (body: object) => void }> = [];

    globalThis.fetch = vi.fn((url: string) => {
      if (url.includes("launcher-config")) {
        return Promise.resolve(jsonResponse(emptyConfig));
      }
      return new Promise<Response>((resolve) => {
        docFetches.push({ url, resolve: (body) => resolve(jsonResponse(body)) });
      });
    }) as any;

    const ticketA = makeTicket("t-1-alpha", "T-1", "Alpha");
    const ticketB = makeTicket("t-2-bravo", "T-2", "Bravo");
    const [ticket, setTicket] = createSignal<TicketInfo | null>(ticketA);

    render(() => (
      <TicketDetailDialog
        onClose={() => setTicket(null)}
        projectSlug="test-project"
        ticket={ticket()}
      />
    ));

    await flush();
    expect(docFetches.length).toBe(1);

    setTicket(ticketB);
    await flush();
    expect(docFetches.length).toBe(2);

    docFetches[1].resolve({ content: "Content from Bravo" });
    await flush();
    expect(screen.getByTestId("editor-content").textContent).toBe("Content from Bravo");

    docFetches[0].resolve({ content: "Content from Alpha" });
    await flush();
    expect(screen.getByTestId("editor-content").textContent).toBe("Content from Bravo");
  });
});

describe("TicketDetailDialog multi-file upload confirmation", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  function makeLargeFile(name: string, sizeBytes: number): File {
    const buffer = new ArrayBuffer(sizeBytes);
    return new File([buffer], name, { type: "application/octet-stream" });
  }

  it("processes each large file's size confirmation sequentially without overwriting", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    // Wait for the initial content load
    await flush();
    pending[0].resolve({ content: "" });
    await flush();

    // Create two large files (> 10KB each)
    const file1 = makeLargeFile("big1.dat", 20000);
    const file2 = makeLargeFile("big2.dat", 30000);

    // Find the drop button and simulate a drop
    const dropButton = screen.getByText("Drop a file to copy");

    const dataTransfer = {
      files: [file1, file2],
      length: 2,
    };

    fireEvent.drop(dropButton, { dataTransfer });
    await flush();

    // After dropping, only the FIRST file's size confirmation should be shown
    // (not the second, because the loop should be blocked)
    expect(screen.getByText(/big1\.dat/)).toBeTruthy();
    expect(screen.queryByText(/big2\.dat/)).toBeNull();

    // Confirm the first file
    const copyAnywayButton = screen.getByText("Copy Anyway");
    fireEvent.click(copyAnywayButton);
    await flush();

    // The upload for file1 should have started
    const uploadCalls = mockFetch.mock.calls.filter(
      ([url]: [string, RequestInit?]) => url.includes("files/upload")
    );
    expect(uploadCalls.length).toBe(1);

    // Resolve the upload for file1
    const uploadPending = pending.find((_p, i) =>
      mockFetch.mock.calls[i]?.[0]?.toString().includes("files/upload")
    );
    uploadPending!.resolve({ results: [{ ok: true, name: "big1.dat" }] });
    await flush();

    // Now the second file's size confirmation should appear
    expect(screen.getByText(/big2\.dat/)).toBeTruthy();

    // Confirm the second file
    const copyAnywayButton2 = screen.getByText("Copy Anyway");
    fireEvent.click(copyAnywayButton2);
    await flush();

    // The upload for file2 should have started
    const uploadCalls2 = mockFetch.mock.calls.filter(
      ([url]: [string, RequestInit?]) => url.includes("files/upload")
    );
    expect(uploadCalls2.length).toBe(2);
  });

  it("cancelling first file lets second file show its confirmation", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    pending[0].resolve({ content: "" });
    await flush();

    const file1 = makeLargeFile("large1.dat", 20000);
    const file2 = makeLargeFile("large2.dat", 30000);

    const dropButton = screen.getByText("Drop a file to copy");
    fireEvent.drop(dropButton, {
      dataTransfer: { files: [file1, file2], length: 2 },
    });
    await flush();

    // First file's confirmation is shown
    expect(screen.getByText(/large1\.dat/)).toBeTruthy();

    // Cancel the first file -- find the Cancel button inside the open dialog
    const fileText = screen.getByText(/large1\.dat/);
    const dialogContent = fileText.closest("[data-state='open']")!;
    const cancelButton = dialogContent.querySelector("button")!;
    fireEvent.click(cancelButton);
    await flush();

    // Second file's confirmation should now appear
    expect(screen.getByText(/large2\.dat/)).toBeTruthy();

    // No uploads should have happened (first was cancelled)
    const uploadCalls = mockFetch.mock.calls.filter(
      ([url]: [string, RequestInit?]) => url.includes("files/upload")
    );
    expect(uploadCalls.length).toBe(0);
  });

  it("processes overwrite confirmations sequentially for multiple existing files", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    // Create ticket with existing files so drops trigger overwrite
    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");
    ticket.fileNames = ["exist1.txt", "exist2.txt"];

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    pending[0].resolve({ content: "" });
    await flush();

    // Create small files (< 10KB) that already exist, triggering overwrite
    const file1 = new File(["hello"], "exist1.txt", { type: "text/plain" });
    const file2 = new File(["world"], "exist2.txt", { type: "text/plain" });

    const dropButton = screen.getByText("Drop a file to copy");
    fireEvent.drop(dropButton, {
      dataTransfer: { files: [file1, file2], length: 2 },
    });
    await flush();

    // First file's overwrite confirmation should be shown
    expect(screen.getByText(/exist1\.txt/)).toBeTruthy();
    expect(screen.getByText("Overwrite File")).toBeTruthy();

    // Confirm overwrite for first file
    const overwriteButton = screen.getByText("Overwrite");
    fireEvent.click(overwriteButton);
    await flush();

    // Upload for file1 should have started
    const uploadCalls = mockFetch.mock.calls.filter(
      ([url]: [string, RequestInit?]) => url.includes("files/upload")
    );
    expect(uploadCalls.length).toBe(1);

    // Resolve the upload
    const uploadIdx = mockFetch.mock.calls.findIndex(
      ([url]: [string, RequestInit?]) => url.includes("files/upload")
    );
    pending[uploadIdx].resolve({ results: [{ ok: true, name: "exist1.txt" }] });
    await flush();

    // Second file's overwrite confirmation should now appear
    expect(screen.getByText(/exist2\.txt/)).toBeTruthy();
    expect(screen.getByText("Overwrite File")).toBeTruthy();
  });
});

describe("TicketDetailDialog context deletion clears extraFiles", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("deleting a context added via New markdown file removes it from the dropdown", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    // Wait for initial content load (to-do context)
    await flush();
    pending[0].resolve({ content: "" });
    await flush();

    // Open the "New markdown file" dialog
    const newFileButton = screen.getByText("New markdown file");
    fireEvent.click(newFileButton);
    await flush();

    // Enter a file name and create it
    const input = screen.getByPlaceholderText("e.g. design-notes");
    fireEvent.input(input, { target: { value: "ghost-doc" } });
    await flush();

    const createButton = screen.getByText("Create");
    fireEvent.click(createButton);
    await flush();

    // The effect fires to load the new context content
    const loadIdx = pending.length - 1;
    pending[loadIdx].resolve({ content: "" });
    await flush();

    // Open the dropdown and verify the new context appears
    const dropdownButton = screen.getByText("ghost-doc.md");
    fireEvent.click(dropdownButton);
    await flush();

    const dropdownOptions = screen.getAllByRole("button").map((b) => b.textContent);
    expect(dropdownOptions.some((t) => t?.includes("ghost-doc.md"))).toBe(true);

    // Close dropdown
    fireEvent.click(dropdownButton);
    await flush();

    // Click the trash button to delete the active file (ghost-doc)
    const trashButton = screen.getByTitle("Delete file");
    fireEvent.click(trashButton);
    await flush();

    // Confirm deletion in the dialog
    const deleteButton = screen.getByText("Delete");
    fireEvent.click(deleteButton);
    await flush();

    // The DELETE fetch for the context
    const deleteIdx = pending.length - 1;
    pending[deleteIdx].resolve({});
    await flush();

    // After deletion, selection falls back to "to-do" -- the effect fires to load it
    const fallbackIdx = pending.length - 1;
    pending[fallbackIdx].resolve({ content: "" });
    await flush();

    // Open dropdown and verify ghost-doc is gone
    const currentLabel = screen.getByText("to-do.md");
    fireEvent.click(currentLabel);
    await flush();

    const optionsAfterDelete = screen.getAllByRole("button").map((b) => b.textContent);
    expect(optionsAfterDelete.some((t) => t?.includes("ghost-doc.md"))).toBe(false);
  });
});

describe("TicketDetailDialog initial tab", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("shows the configured tab at start without flashing the editor first", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();

    // Before the launcher config resolves, no tab content (editor or launcher) is shown.
    expect(screen.queryByText("Drop a file to copy")).toBeNull();
    expect(screen.queryByTestId("agent-launcher")).toBeNull();

    // Resolve the launcher-config fetch with a column default pointing at the launcher tab.
    const configIdx = mockFetch.mock.calls.findIndex(
      ([url]: [string, RequestInit?]) => url.toString().includes("launcher-config")
    );
    pending[configIdx].resolve({
      ...emptyConfig,
      columnDefaults: { todo: { lastLayer: "launcher" } },
    });
    await flush();

    // The launcher tab is shown directly; the editor toolbar never appeared.
    expect(screen.getByTestId("agent-launcher")).toBeTruthy();
    expect(screen.queryByText("Drop a file to copy")).toBeNull();
  });
});

describe("TicketDetailDialog editable title", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  it("Save button appears and saves header changes", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    pending[0].resolve(emptyConfig);
    await flush();

    const titleInput = screen.getByTestId("ticket-detail-title-input") as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: "Beta" } });
    await flush();

    fireEvent.click(screen.getByTestId("ticket-detail-save-button"));
    await flush();

    const putCall = mockFetch.mock.calls.find(
      ([url, opts]: [string, RequestInit?]) =>
        url.includes("/board/tickets/t-1-alpha") && opts?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(putCall![1]!.body as string)).toEqual({ title: "Beta" });
  });

  it("Escape after save reverts to saved value, not original prop", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    pending[0].resolve(emptyConfig);
    await flush();

    const titleInput = screen.getByTestId("ticket-detail-title-input") as HTMLInputElement;
    fireEvent.input(titleInput, { target: { value: "Beta" } });
    await flush();

    fireEvent.click(screen.getByTestId("ticket-detail-save-button"));
    await flush();

    const putIdx = mockFetch.mock.calls.findIndex(
      ([url, opts]: [string, RequestInit?]) =>
        url.includes("/board/tickets/") && opts?.method === "PUT",
    );
    pending[putIdx].resolve({ folderName: "t-1-beta" });
    await flush();

    fireEvent.input(titleInput, { target: { value: "Gamma" } });
    await flush();
    fireEvent.keyDown(titleInput, { key: "Escape" });
    await flush();

    expect(titleInput.value).toBe("Beta");
  });

  it("Escape reverts inputs without saving", async () => {
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticket = makeTicket("t-1-alpha", "T-1", "Alpha");

    render(() => (
      <TicketDetailDialog
        onClose={() => {}}
        projectSlug="test-project"
        ticket={ticket}
      />
    ));

    await flush();
    pending[0].resolve(emptyConfig);
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

    const putCalls = mockFetch.mock.calls.filter(
      ([url, opts]: [string, RequestInit?]) =>
        url.includes("/board/tickets/") && opts?.method === "PUT",
    );
    expect(putCalls.length).toBe(0);
  });
});
