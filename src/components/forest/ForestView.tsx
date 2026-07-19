import { createAsync, revalidate } from "@solidjs/router";
import {
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import CreateTicketDialog from "../ticket/CreateTicketDialog";
import ErrorDialog from "../shared/ErrorDialog";
import ExpandingOverlay, { type ExpandingOverlayOrigin, type OverlayRect } from "../shared/ExpandingOverlay";
import ForestSurface, {
  type ForestSurfaceApi,
  type ForestSurfaceCommands,
  type ForestSurfaceData,
} from "./ForestSurface.js";
import {
  connectionPreviewPath,
  createForestConnection,
  type ConnectionEndpoint,
} from "./forest-connections.js";
import {
  addDependency,
  createGroupTicket,
  getForestLayout,
  removeDependency,
  saveForestPositions,
  ungroupTicket,
} from "./forest-api.js";
import { getForestViewport, setForestViewport } from "./forest-local-state.js";
import type { DependencyRelation, ForestTicket } from "./forest-graph.js";
import { useEscapeKey } from "~/lib/use-escape-key.js";
import type { BoardState } from "~/core/board/board-types.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import type { ForestLayout } from "~/core/ticket/forest-layout-store.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { HerdrAgentStatus } from "~/core/herdr/herdr-client.js";

interface ForestViewProps {
  board: BoardState;
  projectSlug: string;
  onViewDetail: (ticket: TicketInfo) => void;
  suggestedNextNumber?: string | null;
  herdrStatuses?: Record<string, HerdrAgentStatus>;
}

interface GroupingDraft {
  ownerGroupNumber?: string;
  memberNumbers: string[];
  position: { x: number; y: number };
}

export default function ForestView(props: ForestViewProps) {
  const layout = createAsync(() => getForestLayout(props.projectSlug));
  const [error, setError] = createSignal<ErrorInfo>();
  const [openGroups, setOpenGroups] = createSignal<string[]>([]);
  const [openGroupOrigin, setOpenGroupOrigin] = createSignal<ExpandingOverlayOrigin>();
  const [groupingDraft, setGroupingDraft] = createSignal<GroupingDraft>();
  const [createDialogOpen, setCreateDialogOpen] = createSignal(false);
  const connection = createForestConnection();
  const surfaceApis = new Map<string, ForestSurfaceApi>();
  const herdrStatuses = () => props.herdrStatuses ?? {};
  let containerRef: HTMLDivElement | undefined;

  const tickets = createMemo<ForestTicket[]>(() => props.board.tickets.map(ticket => ({
    number: ticket.number,
    title: ticket.title,
    status: ticket.status,
    folderName: ticket.folderName,
    dependsOn: ticket.dependsOn,
    memberOf: ticket.memberOf,
  })));

  function requireContainer(): HTMLDivElement {
    if (!containerRef) throw new Error("Forest view is not mounted");
    return containerRef;
  }

  function reportError(caught: unknown) {
    setError(errorPayload(caught));
  }

  function findTicket(ticketNumber: string): TicketInfo {
    const ticket = props.board.tickets.find(candidate => candidate.number === ticketNumber);
    if (!ticket) throw new Error(`Ticket ${ticketNumber} is not available in this forest`);
    return ticket;
  }

  function registerSurface(scopeGroupNumber: string | undefined, api: ForestSurfaceApi | undefined) {
    const key = scopeGroupNumber ?? "root";
    if (api) surfaceApis.set(key, api);
    else surfaceApis.delete(key);
  }

  async function runMutation(
    mutate: () => Promise<{ ok: true } | { ok: false; message: string }>,
    revalidateKeys: string[],
  ): Promise<boolean> {
    const result = await mutate();
    if (!result.ok) {
      setError({ description: result.message });
      return false;
    }
    await revalidate(revalidateKeys);
    return true;
  }

  async function persistPositions(positions: ForestLayout) {
    await runMutation(() => saveForestPositions(props.projectSlug, positions), ["forest-layout"]);
  }

  function handleAddDependency(dependentNumber: string, dependencyNumber: string) {
    const dependent = findTicket(dependentNumber);
    return runMutation(
      () => addDependency(props.projectSlug, dependent.folderName, dependencyNumber),
      ["project-page"],
    );
  }

  async function handleRemoveDependencies(relations: DependencyRelation[]) {
    try {
      for (const relation of relations) {
        const dependent = findTicket(relation.fromNumber);
        const result = await removeDependency(
          props.projectSlug,
          dependent.folderName,
          relation.toNumber,
        );
        if (!result.ok) {
          setError({ description: result.message });
          return;
        }
      }
    } finally {
      await revalidate("project-page");
    }
  }

  async function handleUngroup(ticketNumber: string) {
    const group = findTicket(ticketNumber);
    await runMutation(
      () => ungroupTicket(props.projectSlug, group.folderName),
      ["project-page", "forest-layout"],
    );
  }

  function openGroup(
    ticketNumber: string,
    cardRect: OverlayRect,
    parentDepth: number,
  ) {
    const containerRect = requireContainer().getBoundingClientRect();
    setOpenGroupOrigin({
      x: cardRect.x - containerRect.x,
      y: cardRect.y - containerRect.y,
      width: cardRect.width,
      height: cardRect.height,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
    });
    setOpenGroups(current => [...current.slice(0, parentDepth), ticketNumber]);
  }

  function closeGroup(index: number) {
    const groups = openGroups();
    const session = connection.session();
    if (session.kind === "connecting") {
      const parentGroupNumber = groups[index - 1];
      const parentApi = surfaceApis.get(parentGroupNumber ?? "root");
      const anchor = parentApi?.connectionAnchor(session.source);
      if (anchor) connection.commands.reanchorSource(anchor);
    }
    setOpenGroups(groups.slice(0, index));
  }

  async function handleGroupCreate(
    number: string,
    title: string,
  ): Promise<{ error?: string }> {
    const draft = groupingDraft();
    if (!draft) return { error: "No members selected" };
    const memberFolderNames = draft.memberNumbers.map(memberNumber => findTicket(memberNumber).folderName);
    const result = await createGroupTicket(
      props.projectSlug,
      number,
      title,
      memberFolderNames,
      draft.ownerGroupNumber,
      draft.position,
    );
    if (!result.ok) return { error: result.message };
    setGroupingDraft(undefined);
    await Promise.all([revalidate("project-page"), revalidate("forest-layout")]);
    return {};
  }

  function surfaceCommands(
    scopeGroupNumber: string | undefined,
    depth: number,
  ): ForestSurfaceCommands {
    return {
      addDependency: handleAddDependency,
      groupSelection: (memberNumbers, position) => {
        setGroupingDraft({ ownerGroupNumber: scopeGroupNumber, memberNumbers, position });
        setCreateDialogOpen(true);
      },
      openGroup: (ticketNumber, cardRect) => openGroup(ticketNumber, cardRect, depth),
      openTicket: ticketNumber => props.onViewDetail(findTicket(ticketNumber)),
      persistPositions,
      persistViewport: scopeGroupNumber === undefined
        ? (viewport) => setForestViewport(localStorage, props.projectSlug, viewport)
        : undefined,
      registerSurface: api => registerSurface(scopeGroupNumber, api),
      removeDependencies: handleRemoveDependencies,
      reportError,
      ungroup: ticketNumber => void handleUngroup(ticketNumber).catch(reportError),
    };
  }

  const previewPath = createMemo(() => {
    const session = connection.session();
    if (!containerRef) return undefined;
    return connectionPreviewPath(session, containerRef.getBoundingClientRect());
  });

  useEscapeKey(() => connection.commands.cancel());

  const rootViewport = createMemo(() => getForestViewport(localStorage, props.projectSlug));

  const baseSurfaceData = (loadedLayout: ForestLayout) => ({
    tickets: tickets(),
    layout: loadedLayout,
    columns: props.board.columns,
    herdrStatuses: herdrStatuses(),
  });

  return (
    <div ref={containerRef} class="relative h-full w-full">
      <Show when={layout()}>
        {(loadedLayout) => (
          <>
            <ForestSurface
              data={{
                ...baseSurfaceData(loadedLayout()),
                viewport: rootViewport(),
              } satisfies ForestSurfaceData}
              commands={surfaceCommands(undefined, 0)}
              connectionSession={connection.session}
              connectionCommands={connection.commands}
            />

            <For each={openGroups()}>
              {(groupNumber, index) => (
                <ExpandingOverlay
                  origin={index() === openGroups().length - 1 ? openGroupOrigin() : undefined}
                  onClose={() => closeGroup(index())}
                  backdropAttributes={{ "data-testid": "forest-subforest-backdrop" }}
                  panelAttributes={{ "data-forest-connection-boundary": "" }}
                  panelClass="absolute rounded-lg border border-border bg-background shadow-lg"
                >
                  <div class="h-full w-full">
                    <ForestSurface
                      data={{
                        ...baseSurfaceData(loadedLayout()),
                        scopeGroupNumber: groupNumber,
                      } satisfies ForestSurfaceData}
                      commands={surfaceCommands(groupNumber, index() + 1)}
                      connectionSession={connection.session}
                      connectionCommands={connection.commands}
                    />
                  </div>
                  <button
                    class="btn-icon absolute right-2 top-2"
                    onClick={() => closeGroup(index())}
                    data-testid="forest-subforest-close"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"
                    >
                      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                  </button>
                </ExpandingOverlay>
              )}
            </For>
          </>
        )}
      </Show>

      <Show when={previewPath()}>
        {(path) => (
          <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <path
              d={path()}
              fill="none"
              class="stroke-primary"
              stroke-width="2"
              stroke-dasharray="6 4"
              data-testid="forest-connection-preview"
            />
          </svg>
        )}
      </Show>

      <CreateTicketDialog
        open={createDialogOpen()}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setGroupingDraft(undefined);
        }}
        onSubmit={handleGroupCreate}
        suggestedNextNumber={props.suggestedNextNumber}
        projectSlug={props.projectSlug}
      />

      <ErrorDialog error={error() ?? null} onClose={() => setError(undefined)} />
    </div>
  );
}
