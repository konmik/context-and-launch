import { revalidate, useAction } from "@solidjs/router";
import {
  createMemo,
  createSignal,
  For,
  Show,
  useContext,
} from "solid-js";
import { X } from "~/components/ui/icons.js";
import CreateTicketDialog from "../ticket/CreateTicketDialog";
import ErrorDialog from "../shared/ErrorDialog";
import ExpandingOverlay, { type ExpandingOverlayOrigin, type OverlayRect } from "../shared/ExpandingOverlay";
import ForestSurface, {
  type ForestSurfaceApi,
  type ForestSurfaceCommands,
} from "./ForestSurface.js";
import {
  connectionPreviewPath,
  createForestConnection,
} from "./forest-connections.js";
import {
  addDependency,
  createGroupTicket,
  removeDependencies,
  ungroupTicket,
} from "./forest-api.js";
import { getForestViewport, setForestViewport } from "./forest-local-state.js";
import type { DependencyRelation } from "./forest-graph.js";
import { useEscapeKey } from "~/lib/use-escape-key.js";
import { ticketMutationRevalidateKeys } from "../shared/revalidate-keys.js";
import type { BoardState } from "~/core/board/board-types.js";
import { errorPayload, type ErrorInfo } from "~/core/shared/errors.js";
import { createForestLayoutStorage, ForestLayoutContext } from "./forest-layout-storage.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";

interface ForestViewProps {
  board: BoardState;
  projectSlug: string;
  onViewDetail: (ticket: TicketInfo) => void;
  onClose: () => void;
  suggestedNextNumber?: string | null;
}

interface GroupingDraft {
  ownerGroupNumber?: string;
  memberNumbers: string[];
  position: { x: number; y: number };
}

export default function ForestView(props: ForestViewProps) {
  return <Show when={props.projectSlug} keyed>{projectSlug =>
    <ForestLayoutContext value={createForestLayoutStorage(projectSlug)}>
      <ForestContent {...props} />
    </ForestLayoutContext>
  }</Show>;
}

function ForestContent(props: ForestViewProps) {
  const layout = useContext(ForestLayoutContext)!;
  const [error, setError] = createSignal<ErrorInfo>();
  const [openGroups, setOpenGroups] = createSignal<string[]>([]);
  const [openGroupOrigin, setOpenGroupOrigin] = createSignal<ExpandingOverlayOrigin>();
  const [groupingDraft, setGroupingDraft] = createSignal<GroupingDraft>();
  const [createDialogOpen, setCreateDialogOpen] = createSignal(false);
  const runAddDependency = useAction(addDependency);
  const runRemoveDependencies = useAction(removeDependencies);
  const runCreateGroupTicket = useAction(createGroupTicket);
  const runUngroupTicket = useAction(ungroupTicket);
  const connection = createForestConnection();
  const surfaceApis = new Map<string, ForestSurfaceApi>();
  let containerRef: HTMLDivElement | undefined;

  function requireContainer(): HTMLDivElement {
    if (!containerRef) throw new Error("Forest view is not mounted");
    return containerRef;
  }

  function reportError(cause: unknown) {
    setError(errorPayload(cause));
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

  async function mutateAndRefreshTickets(
    mutate: () => Promise<{ ok: true } | { ok: false; message: string }>,
  ): Promise<boolean> {
    const result = await mutate();
    if (!result.ok) {
      setError({ description: result.message });
      return false;
    }
    await revalidate(ticketMutationRevalidateKeys);
    return true;
  }

  function handleAddDependency(dependentNumber: string, dependencyNumber: string) {
    const dependent = findTicket(dependentNumber);
    return mutateAndRefreshTickets(
      () => runAddDependency({
        projectSlug: props.projectSlug,
        folderName: dependent.folderName,
        dependencyNumber,
      }),
    );
  }

  async function handleRemoveDependency(relations: DependencyRelation[]) {
    const removals = relations.map(relation => ({
      folderName: findTicket(relation.fromNumber).folderName,
      dependencyNumber: relation.toNumber,
    }));
    try {
      const result = await runRemoveDependencies({ projectSlug: props.projectSlug, removals });
      if (!result.ok) setError({ description: result.message });
    } finally {
      await revalidate(ticketMutationRevalidateKeys);
    }
  }

  async function handleUngroup(ticketNumber: string) {
    const group = findTicket(ticketNumber);
    const changed = await mutateAndRefreshTickets(
      () => runUngroupTicket({ projectSlug: props.projectSlug, folderName: group.folderName }),
    );
    if (changed) {
      const result = await layout.refresh();
      if (result.type === 'Failure') reportError(result.error);
    }
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
    const result = await runCreateGroupTicket({
      projectSlug: props.projectSlug,
      number,
      title,
      memberFolderNames,
      parentGroupNumber: draft.ownerGroupNumber ?? null,
      position: draft.position,
    });
    if (!result.ok) return { error: result.message };
    surfaceApis.get(draft.ownerGroupNumber ?? "root")?.clearSelection();
    setGroupingDraft(undefined);
    const refreshed = await layout.refresh();
    if (refreshed.type === 'Failure') reportError(refreshed.error);
    await revalidate(ticketMutationRevalidateKeys);
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
      onClose: scopeGroupNumber === undefined ? props.onClose : undefined,
      openGroup: (ticketNumber, cardRect) => openGroup(ticketNumber, cardRect, depth),
      openTicket: ticketNumber => props.onViewDetail(findTicket(ticketNumber)),
      persistViewport: scopeGroupNumber === undefined
        ? (viewport) => setForestViewport(localStorage, props.projectSlug, viewport)
        : undefined,
      registerSurface: api => registerSurface(scopeGroupNumber, api),
      removeDependency: handleRemoveDependency,
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

  return (
    <div ref={containerRef} class="relative h-full w-full">
      <ForestSurface
        data={{
          tickets: props.board.tickets,
          columns: props.board.columns,
          viewport: rootViewport(),
        }}
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
            panelClass="absolute rounded-lg border border-border bg-background"
          >
            <div class="h-full w-full">
              <ForestSurface
                data={{
                  tickets: props.board.tickets,
                  columns: props.board.columns,
                  scopeGroupNumber: groupNumber,
                }}
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
              <X size={16} />
            </button>
          </ExpandingOverlay>
        )}
      </For>

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
