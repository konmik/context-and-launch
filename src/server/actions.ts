import { query } from "@solidjs/router";
import { projectRegistry, projectPageService } from "~/server/config/instances.js";

export type { BoardState, ProjectPageData } from "~/server/board/board-types.js";

export const getDefaultProjectSlug = query(async (): Promise<string | null> => {
  "use server";
  return projectRegistry.getDefaultProjectSlug();
}, "default-project-slug");

export const loadProjectPage = query(async (projectSlug: string) => {
  "use server";
  return projectPageService.loadProjectPage(projectSlug);
}, "project-page");
