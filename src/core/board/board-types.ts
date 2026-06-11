import * as v from "valibot";
import type { ProjectInfo } from "~/core/project/project-registry.js";
import type { ColumnDefinition } from "~/core/project/board-config.js";
import type { TicketInfo } from "~/core/ticket/ticket-store.js";
import type { TicketOrder } from "~/core/ticket/ticket-order.js";

export interface BoardState {
  columns: ColumnDefinition[];
  tickets: TicketInfo[];
  ticketOrder: TicketOrder;
}

interface BoardPageBase {
  projects: ProjectInfo[];
  projectSlug: string;
}

const RequiredNameBody = v.object({
  name: v.pipe(v.string(), v.nonEmpty("Missing required field: name")),
});

export const CreateBoardBody = RequiredNameBody;
export type CreateBoardBody = v.InferOutput<typeof CreateBoardBody>;

export const RenameBoardBody = RequiredNameBody;
export type RenameBoardBody = v.InferOutput<typeof RenameBoardBody>;

export const AddColumnBody = v.object({
  name: v.pipe(v.string(), v.nonEmpty("Missing required field: name")),
  description: v.optional(v.string()),
});
export type AddColumnBody = v.InferOutput<typeof AddColumnBody>;

export const UpdateColumnBody = v.object({
  description: v.optional(v.string()),
});
export type UpdateColumnBody = v.InferOutput<typeof UpdateColumnBody>;

export const ReorderColumnsBody = v.object({
  columns: v.array(v.string()),
});
export type ReorderColumnsBody = v.InferOutput<typeof ReorderColumnsBody>;

export const RenameColumnBody = v.object({
  newName: v.pipe(v.string(), v.nonEmpty("Missing required field: newName")),
  scope: v.picklist(["all", "current", "none"]),
  currentProjectSlug: v.optional(v.string()),
});
export type RenameColumnBody = v.InferOutput<typeof RenameColumnBody>;

export type ProjectPageData =
  | (BoardPageBase & {
      status: 'loaded'; board: BoardState; projectPath: string;
      suggestedNextNumber: string | null; hasRemote: boolean; hasConflict: boolean;
    })
  | (BoardPageBase & { status: 'not-found' })
  | (BoardPageBase & { status: 'unavailable'; projectPath: string })
  | (BoardPageBase & { status: 'error'; projectPath: string; error: string });
