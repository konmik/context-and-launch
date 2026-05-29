import { query } from "@solidjs/router";
import { projectRegistry, boardService } from "~/server/config/instances.js";

export type { BoardState, BoardPageData } from "~/server/board/board-types.js";

export const getDefaultProjectSlug = query(async (): Promise<string | null> => {
  "use server";
  return projectRegistry.getDefaultProjectSlug();
}, "default-project-slug");

export const loadBoard = query(async (projectSlug: string) => {
  "use server";
  return boardService.loadBoard(projectSlug);
}, "board-data");
