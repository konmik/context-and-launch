import { action, query } from "@solidjs/router";
import { respond } from "@solidjs/web";
import {
  boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
} from "~/core/config/instances.js";
import { cascadeClearBoardId } from "~/core/project/board-delete-cascade.js";
import { renameColumnWithMigration } from "~/core/project/column-rename-migration.js";
import { ValidationError, errorResult } from "~/core/shared/errors.js";
import type { BoardDefinition, ColumnContentPatch } from "~/core/project/board-config.js";

export type BoardRef = Pick<BoardDefinition, "id" | "name">;

const actionResult = <T>(value: T) => respond(value, { revalidate: [] });

export const listBoards = query(async (): Promise<BoardDefinition[]> => {
  "use server";
  return boardConfigManager.listBoards();
}, "boards");

export const createBoard = action(async function createBoard(name: string) {
  "use server";
  try {
    const board = boardConfigManager.createBoard(name);
    return actionResult({ ok: true as const, id: board.id, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "create-board");

export const deleteBoard = action(async function deleteBoard(boardId: string) {
  "use server";
  try {
    boardConfigManager.deleteBoard(boardId);
    cascadeClearBoardId(boardId, { projectRegistry });
    return actionResult({ ok: true as const, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "delete-board");

export const renameBoard = action(async function renameBoard(input: { boardId: string; name: string }) {
  "use server";
  try {
    boardConfigManager.renameBoard(input.boardId, input.name);
    return actionResult({ ok: true as const, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "rename-board");

export const addColumn = action(async function addColumn(
  input: { boardId: string; name: string; patch: ColumnContentPatch },
) {
  "use server";
  try {
    boardConfigManager.addColumn(input.boardId, input.name, input.patch);
    return actionResult({ ok: true as const, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "add-column");

export const updateColumn = action(async function updateColumn(
  input: { boardId: string; columnName: string; patch: ColumnContentPatch },
) {
  "use server";
  try {
    boardConfigManager.updateColumn(input.boardId, input.columnName, input.patch);
    return actionResult({ ok: true as const, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "update-column");

export const deleteColumn = action(async function deleteColumn(input: { boardId: string; columnName: string }) {
  "use server";
  try {
    boardConfigManager.removeColumn(input.boardId, input.columnName);
    return actionResult({ ok: true as const, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "delete-column");

export const renameColumn = action(async function renameColumn(input: {
  boardId: string;
  columnName: string;
  newName: string;
  scope: "all" | "current" | "none";
  currentProjectSlug: string;
}) {
  "use server";
  const { boardId, columnName, newName, scope, currentProjectSlug } = input;
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
    return actionResult({
      ok: true as const,
      newName: result.newName as string,
      boards: boardConfigManager.listBoards(),
    });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "rename-column");

export const reorderColumns = action(async function reorderColumns(input: { boardId: string; columns: string[] }) {
  "use server";
  try {
    boardConfigManager.reorderColumns(input.boardId, input.columns);
    return actionResult({ ok: true as const, boards: boardConfigManager.listBoards() });
  } catch (e) {
    return actionResult(errorResult(e));
  }
}, "reorder-columns");
