import {
  openLauncherSettings, openLauncherSettingsTab, openProject,
  type CreatedProject, type E2EContext, type LauncherSettingsTab,
  type SeedAppLauncherConfig, type SeedBoard,
} from "./fixtures.js";

/** Two boards, so a test can prove a board switch actually changed something. */
export const APP_BOARDS: SeedBoard[] = [
  { id: "kanban", name: "Kanban", columns: [
    { name: "todo" }, { name: "in-progress" }, { name: "done" },
  ] },
  { id: "simple", name: "Simple", columns: [{ name: "todo" }, { name: "done" }] },
];

export interface OpenSettingsTabOptions {
  slugBase: string;
  tab: LauncherSettingsTab;
  withBoards?: SeedBoard[];
  appLauncherConfig?: SeedAppLauncherConfig;
}

/** Seeds a Project, opens it and lands on one tab of the Launcher Settings panel. */
export async function openSettingsTab(
  ctx: E2EContext,
  options: OpenSettingsTabOptions,
): Promise<CreatedProject> {
  const project = await openProject(ctx, {
    slugBase: options.slugBase,
    withBoards: options.withBoards,
    appLauncherConfig: options.appLauncherConfig,
  });
  await openLauncherSettings(ctx.page);
  await openLauncherSettingsTab(ctx.page, options.tab);
  return project;
}
