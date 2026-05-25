import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  revalidate: vi.fn(),
}));

vi.mock("./MarkdownEditor", () => ({
  default: (props: { value: string }) => (
    <div data-testid="editor-content">{props.value}</div>
  ),
}));

vi.mock("./AgentLauncher", () => ({
  default: () => <div data-testid="agent-launcher" />,
}));

vi.mock("./ResizableWindow", () => ({
  default: (props: {
    open: boolean;
    children: any;
    title?: any;
    footer?: any;
    onClose?: () => void;
    onKeyDown?: (e: KeyboardEvent) => void;
    storageKey?: string;
  }) => (
    <div data-testid="resizable-window">
      {typeof props.title === "function" ? props.title() : props.title}
      {typeof props.children === "function" ? props.children() : props.children}
      {typeof props.footer === "function" ? props.footer() : props.footer}
    </div>
  ),
}));

import { createSignal } from "solid-js";
import TicketDetailDialog from "./TicketDetailDialog";
import type { TicketInfo } from "~/types.js";

function makeTicket(folder: string, number: string, title: string): TicketInfo {
  return {
    number,
    title,
    status: "todo",
    folderName: folder,
    stageNames: [],
    useWorktree: false,
  };
}

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
    const { mockFetch, pending } = createFetchController();
    globalThis.fetch = mockFetch as any;

    const ticketA = makeTicket("t-1-alpha", "T-1", "Alpha");
    const ticketB = makeTicket("t-2-bravo", "T-2", "Bravo");

    const [ticket, setTicket] = createSignal<TicketInfo | null>(ticketA);

    render(() => (
      <TicketDetailDialog
        onClose={() => setTicket(null)}
        slug="test-project"
        ticket={ticket()}
      />
    ));

    await flush();
    expect(pending.length).toBe(1);

    setTicket(ticketB);
    await flush();
    expect(pending.length).toBe(2);

    pending[1].resolve({ content: "Content from Bravo" });
    await flush();

    expect(screen.getByTestId("editor-content").textContent).toBe(
      "Content from Bravo"
    );

    pending[0].resolve({ content: "Content from Alpha" });
    await flush();

    expect(screen.getByTestId("editor-content").textContent).toBe(
      "Content from Bravo"
    );
  });
});
