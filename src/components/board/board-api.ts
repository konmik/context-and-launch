import { query } from "@solidjs/router";
import {
  boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
} from "~/core/config/instances.js";
import { cascadeClearBoardId } from "~/core/project/board-delete-cascade.js";
import { renameColumnWithMigration } from "~/core/project/column-rename-migration.js";
import { ValidationError, errorResult } from "~/core/shared/errors.js";
import type { BoardDefinition, ColumnContentPatch } from "~/core/project/board-config.js";

export type BoardRef = Pick<BoardDefinition, "id" | "name">;

export const listBoards = query(async (): Promise<BoardDefinition[]> => {
  "use server";
  return boardConfigManager.listBoards();
}, "boards");

export async function createBoard(name: string) {
  "use server";
  try {
    const board = boardConfigManager.createBoard(name);
    return { ok: true as const, id: board.id };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteBoard(boardId: string) {
  "use server";
  try {
    boardConfigManager.deleteBoard(boardId);
    cascadeClearBoardId(boardId, { projectRegistry });
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function renameBoard(boardId: string, name: string) {
  "use server";
  try {
    boardConfigManager.renameBoard(boardId, name);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function addColumn(boardId: string, name: string, patch: ColumnContentPatch) {
  "use server";
  try {
    boardConfigManager.addColumn(boardId, name, patch);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function updateColumn(boardId: string, columnName: string, patch: ColumnContentPatch) {
  "use server";
  try {
    boardConfigManager.updateColumn(boardId, columnName, patch);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function deleteColumn(boardId: string, columnName: string) {
  "use server";
  try {
    boardConfigManager.removeColumn(boardId, columnName);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}

export async function renameColumn(
  boardId: string, columnName: string, newName: string,
  scope: "all" | "current" | "none", currentProjectSlug: string,
) {
  "use server";
  try {
    if (scope === "current" && !currentProjectSlug) {
      throw new ValidationError(
        "Missing required field: currentProjectSlug (required when scope is 'current')",
      );
    }
    const result = renameColumnWithMigration(
      boardId, columnName, newName, scope, currentProjectSlug, {
        boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
      },
    );
    return { ok: true as const, newName: result.newName as string };
  } catch (e) {
    return errorResult(e);
  }
}

export async function reorderColumns(boardId: string, columns: string[]) {
  "use server";
  try {
    boardConfigManager.reorderColumns(boardId, columns);
    return { ok: true as const };
  } catch (e) {
    return errorResult(e);
  }
}
