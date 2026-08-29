import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterAll, afterEach, beforeAll, beforeEach, expect, inject } from "vitest";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { pickPort } from "./test-port.js";
import { startRealServer, stopRealServer } from "./real-server.js";
import type { ProjectTemplate } from "./project-template.js";
import { TICKETS_BRANCH, commitAll, git, initGitRepo } from "./git-fixtures.js";
import { testId, waitVisible, waitVisibleAny, WAIT_TIMEOUT_MS } from "./locators.js";

/**
 * The board re-checks Sync Pending on this client timer, so a test with a faked
 * clock sees no refresh until it advances past the interval.
 */
const SYNC_PENDING_POLL_MS = 10_000;

/**
 * The deferred work the project page schedules through requestIdleCallback,
 * which Playwright's clock fakes as a 50ms timer.
 */
const IDLE_CALLBACK_MS = 100;

function projectTemplate(): ProjectTemplate {
  return inject("projectTemplate");
}

export interface ProjectDirs {
  dataDir: string;
  /** Parent directory under which each project's tmp git repo is created. */
  reposParentDir: string;
}

export interface TestServer extends ProjectDirs {
  baseUrl: string;
  stop: () => Promise<void>;
}

export interface CreateServerOptions {
  env?: NodeJS.ProcessEnv;
  dataDirPrefix?: string;
  /** Command template overrides layered over the defaults this fixture writes. */
  commandTemplates?: Record<string, string>;
  /**
   * Writes into the data dir before the server starts, for state the server
   * reads once at boot, such as a config file it migrates in place.
   */
  seedDataDir?: (dataDir: string) => void;
}

export async function createServer(opts: CreateServerOptions = {}): Promise<TestServer> {
  const startPort = pickPort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), opts.dataDirPrefix ?? "cl-e2e-data-"));
  const reposParentDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-e2e-repos-"));
  fs.mkdirSync(path.join(dataDir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "config", "command-templates.json"),
    JSON.stringify({
      "herdr.status.server": "herdr-e2e-not-installed status server",
      "herdr.workspace.list": "herdr-e2e-not-installed workspace list",
      "herdr.pane.list": "herdr-e2e-not-installed pane list --workspace {{workspaceId}}",
      "herdr.agent.list": "herdr-e2e-not-installed agent list",
      "herdr.agent.stop": "herdr-e2e-not-installed pane close {{paneId}}",
      ...opts.commandTemplates,
    }, null, 2),
  );
  opts.seedDataDir?.(dataDir);
  const safeEnv: NodeJS.ProcessEnv = {
    CONTEXT_PICKER_STUB: "__cancel__",
    CONTEXT_FILE_PICKER_STUB: "__cancel__",
    CONTEXT_OPEN_IN_OS_STUB: "__noop__",
    ...(opts.env ?? {}),
  };
  const server = await startRealServer(startPort, dataDir, safeEnv);
  return {
    baseUrl: server.baseUrl,
    dataDir,
    reposParentDir,
    stop: async () => {
      await stopRealServer(server);
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (err) {
        console.warn("fixtures.stop dataDir cleanup:", err);
      }
      try { fs.rmSync(reposParentDir, { recursive: true, force: true }); } catch (err) {
        console.warn("fixtures.stop reposParentDir cleanup:", err);
      }
    },
  };
}

export interface SeedTicket {
  number: string;
  title: string;
  status: string;
  useWorktree?: boolean;
  folderName?: string;
  body?: string;
  createdAt?: string;
  dependsOn?: string[];
  memberOf?: string;
}

export interface SeedColumn {
  name: string;
  description?: string;
  color?: string;
}

export interface SeedBoard {
  id: string;
  name: string;
  columns: SeedColumn[];
}

/** The board a test wants when it needs somewhere to drag a ticket to. */
export const THREE_COLUMN_BOARD: SeedBoard[] = [
  { id: "standard", name: "Standard", columns: [
    { name: "todo" }, { name: "in-progress" }, { name: "done" },
  ] },
];

export interface SeedAppLauncherConfig {
  templates?: { name: string; text: string; order?: number }[];
  skills?: { name: string; text: string; order?: number }[];
  profiles?: { name: string; command: string; order?: number }[];
  shortcuts?: { name: string; command: string; order?: number }[];
  conflictResolutionPrompt?: string;
}

export interface CreateProjectOptions {
  /** Base name; the actual projectSlug is derived by the server from this. */
  projectSlug: string;
  withRemote?: boolean;
  withBoards?: SeedBoard[];
  withTickets?: SeedTicket[];
  withTicketOrder?: Record<string, string[]>;
  seedRemoteBaseline?: boolean;
  withWorktrees?: { folderName: string }[];
  worktreeRootPath?: string;
  mainBranch?: string;
  appLauncherConfig?: SeedAppLauncherConfig;
}

export interface CreatedProject {
  projectSlug: string;
  projectPath: string;
  ticketsPath: string;
  worktreeRootPath: string | null;
  branch: string;
  remoteUrl: string | null;
  cleanup: () => void;
}

function toKebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function seedAppConfigFiles(
  dataDir: string,
  boards: SeedBoard[] | undefined,
  appLauncher: SeedAppLauncherConfig | undefined,
): void {
  const configDir = path.join(dataDir, "config");
  fs.mkdirSync(configDir, { recursive: true });
  if (boards) {
    fs.writeFileSync(
      path.join(configDir, "boards.json"),
      JSON.stringify(boards, null, 2),
    );
  }
  if (appLauncher) {
    const merged = {
      templates: appLauncher.templates ?? [],
      skills: appLauncher.skills ?? [],
      profiles: appLauncher.profiles ?? [],
      shortcuts: appLauncher.shortcuts ?? [],
      conflictResolutionPrompt: appLauncher.conflictResolutionPrompt,
    };
    fs.writeFileSync(
      path.join(configDir, "launcher-config.json"),
      JSON.stringify(merged, null, 2),
    );
  }
}

function makeRepoDir(projectSlug: string, parentDir: string): string {
  const dir = path.join(parentDir, projectSlug);
  fs.mkdirSync(parentDir, { recursive: true });
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: false });
  return dir;
}

function remoteDirFor(repoPath: string): string {
  return repoPath + "-remote.git";
}

function setupBareRemote(repoPath: string, branch: string, pushMain = true): string {
  const remoteDir = remoteDirFor(repoPath);
  git(`init --bare -b ${branch} "${remoteDir}"`, os.tmpdir());
  git(`remote add origin "${remoteDir}"`, repoPath);
  if (pushMain) git("push -u origin main", repoPath);
  return remoteDir;
}

export async function createProject(
  server: ProjectDirs,
  opts: CreateProjectOptions,
): Promise<CreatedProject> {
  seedAppConfigFiles(server.dataDir, opts.withBoards, opts.appLauncherConfig);

  const projectPath = makeRepoDir(opts.projectSlug, server.reposParentDir);

  // seedRemoteBaseline needs a remote that starts without the Orphan Branch, a
  // shape the template does not hold, so that one runs the git ceremony.
  const fromTemplate = !opts.seedRemoteBaseline;
  const seedsTickets = Boolean(
    opts.withRemote || opts.withTickets?.length || opts.withTicketOrder,
  );

  let remoteUrl: string | null = null;
  if (!fromTemplate) {
    initGitRepo(projectPath);
    if (opts.withRemote) {
      remoteUrl = setupBareRemote(projectPath, TICKETS_BRANCH, false);
    }
  } else {
    const template = projectTemplate();
    fs.cpSync(template.repo, projectPath, { recursive: true });
    if (opts.withRemote) {
      remoteUrl = remoteDirFor(projectPath);
      fs.cpSync(template.remote, remoteUrl, { recursive: true });
      git(`remote set-url origin "${remoteUrl}"`, projectPath);
    } else {
      git("remote remove origin", projectPath);
    }
  }

  const ticketsPath = path.join(server.dataDir, "projects", opts.projectSlug, "tickets");
  const worktreeRootPath = opts.worktreeRootPath
    ?? (opts.withWorktrees && opts.withWorktrees.length > 0
      ? path.join(server.dataDir, "projects", opts.projectSlug, "worktrees")
      : null);

  const canonicalProjectPath = fs.realpathSync(projectPath);
  const configDir = path.join(server.dataDir, "config");
  const configFile = path.join(configDir, "config.json");
  fs.mkdirSync(configDir, { recursive: true });
  let registry: { projects: any[]; lastUsedProjectSlug: string | null } =
    { projects: [], lastUsedProjectSlug: null };
  if (fs.existsSync(configFile)) {
    registry = JSON.parse(fs.readFileSync(configFile, "utf-8"));
  }
  const projectEntry = {
    path: canonicalProjectPath,
    projectSlug: opts.projectSlug,
    branch: TICKETS_BRANCH,
  };
  if (opts.mainBranch) Object.assign(projectEntry, { mainBranch: opts.mainBranch });
  registry.projects.push(projectEntry);
  registry.lastUsedProjectSlug = opts.projectSlug;
  fs.writeFileSync(configFile, JSON.stringify(registry, null, 2));

  const defaultWorktreeRoot = path.join(server.dataDir, "projects", opts.projectSlug, "worktrees");
  const effectiveWorktreeRootPath = worktreeRootPath ?? defaultWorktreeRoot;

  const projectConfigDir = path.join(server.dataDir, "projects", opts.projectSlug, "config");
  fs.mkdirSync(projectConfigDir, { recursive: true });
  const projectLauncherFile = path.join(projectConfigDir, "launcher-config.json");
  let projectLauncher: Record<string, unknown> = {};
  if (fs.existsSync(projectLauncherFile)) {
    projectLauncher = JSON.parse(fs.readFileSync(projectLauncherFile, "utf-8"));
  }
  projectLauncher.worktreeRootPath = effectiveWorktreeRootPath;
  fs.writeFileSync(projectLauncherFile, JSON.stringify(projectLauncher, null, 2));

  function ensureTicketsWorktree(): void {
    if (fs.existsSync(path.join(ticketsPath, ".git"))) return;
    fs.mkdirSync(path.dirname(ticketsPath), { recursive: true });
    if (fromTemplate) {
      // The copy already carries the Orphan Branch and its upstream tracking,
      // so registering a worktree for it takes one command.
      git(`worktree add "${ticketsPath}" "${TICKETS_BRANCH}"`, projectPath);
      return;
    }
    git(`worktree add --orphan -b "${TICKETS_BRANCH}" "${ticketsPath}"`, projectPath);
    git("commit --allow-empty -m init", ticketsPath);
  }

  if (seedsTickets) {
    ensureTicketsWorktree();
  }

  if ((opts.withTickets && opts.withTickets.length > 0) || opts.withTicketOrder) {
    const useWorktreeFolders = new Set(
      (opts.withWorktrees ?? []).map((w) => w.folderName),
    );
    for (const t of opts.withTickets ?? []) {
      const folderName = t.folderName
        ?? toKebab(`${t.number}-${t.title}`);
      const folder = path.join(ticketsPath, folderName);
      fs.mkdirSync(folder, { recursive: true });
      const status = {
        number: t.number,
        title: t.title,
        status: t.status,
        useWorktree: t.useWorktree ?? useWorktreeFolders.has(folderName),
      };
      if (t.createdAt) Object.assign(status, { createdAt: t.createdAt });
      if (t.dependsOn) Object.assign(status, { dependsOn: t.dependsOn });
      if (t.memberOf) Object.assign(status, { memberOf: t.memberOf });
      fs.writeFileSync(
        path.join(folder, "status.json"),
        JSON.stringify(status, null, 2),
      );
      fs.writeFileSync(path.join(folder, "to-do.md"), t.body ?? "");
    }
    if (opts.withTicketOrder) {
      fs.writeFileSync(
        path.join(ticketsPath, "ticket-order.json"),
        JSON.stringify(opts.withTicketOrder, null, 2),
      );
    }
    commitAll(ticketsPath, "seed");
  }

  if (opts.withRemote && !fromTemplate) {
    git(`push -u origin "${TICKETS_BRANCH}"`, ticketsPath);
  }

  if (opts.withWorktrees && opts.withWorktrees.length > 0 && worktreeRootPath) {
    for (const w of opts.withWorktrees) {
      const wtPath = path.join(worktreeRootPath, w.folderName);
      const wtBranch = w.folderName;
      fs.mkdirSync(path.dirname(wtPath), { recursive: true });
      git(`worktree add "${wtPath}" -b "${wtBranch}"`, projectPath);
    }
  }

  const cleanup = () => {
    if (opts.withWorktrees && worktreeRootPath) {
      for (const w of opts.withWorktrees) {
        const wtPath = path.join(worktreeRootPath, w.folderName);
        if (!fs.existsSync(wtPath)) continue;
        try {
          git(`worktree remove --force "${wtPath}"`, projectPath);
        } catch (err) {
          console.warn("worktree remove failed:", err);
        }
      }
    }
    try { fs.rmSync(projectPath, { recursive: true, force: true }); } catch (err) {
      console.warn("projectPath cleanup failed:", err);
    }
    if (remoteUrl) {
      try { fs.rmSync(remoteUrl, { recursive: true, force: true }); } catch (err) {
        console.warn("remoteUrl cleanup failed:", err);
      }
    }
  };

  return {
    projectSlug: opts.projectSlug,
    projectPath,
    ticketsPath,
    worktreeRootPath,
    branch: TICKETS_BRANCH,
    remoteUrl,
    cleanup,
  };
}

const slugCounters = new Map<string, number>();
export function uniqueSlug(base: string): string {
  const safe = toKebab(base);
  const n = slugCounters.get(safe) ?? 0;
  slugCounters.set(safe, n + 1);
  return n === 0 ? safe : `${safe}-${n}`;
}

export function setCommandTemplateOverride(
  server: TestServer, key: string, script: string,
): void {
  const file = path.join(server.dataDir, "config", "command-templates.json");
  const current = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, string>;
  current[key] = script;
  fs.writeFileSync(file, JSON.stringify(current, null, 2));
}

/**
 * Opens a Project on a faked clock and advances past the page's deferred start-up
 * work, so its first Sync Pending fetch runs at once. Call page.clock.install()
 * before the first navigation; every later navigation goes through here too.
 */
export async function gotoProjectOnFakeClock(
  page: Page,
  server: TestServer,
  projectSlug: string,
): Promise<void> {
  await gotoProject(page, server, projectSlug);
  await page.clock.fastForward(IDLE_CALLBACK_MS);
}

/** Runs the next Sync Pending poll on a faked clock. */
export async function fastForwardPastSyncPoll(page: Page): Promise<void> {
  await page.clock.fastForward(SYNC_PENDING_POLL_MS + 1000);
}

/**
 * Runs one Sync Pending poll per attempt until the element shows. Each attempt
 * re-runs the fetch, so a poll that lands before the server has seen a change is
 * followed by one that lands after it.
 */
export async function fastForwardUntilVisible(
  page: Page,
  id: string,
  timeoutMs = 5000,
): Promise<void> {
  await expect.poll(async () => {
    await fastForwardPastSyncPoll(page);
    return testId(page, id).isVisible();
  }, { timeout: timeoutMs }).toBe(true);
}

export async function gotoProject(page: Page, server: TestServer, projectSlug: string): Promise<void> {
  await page.goto(`${server.baseUrl}/project/${projectSlug}`);
  await waitVisible(page, "project-header-settings-button");
  await waitVisibleAny(page, ["kanban-board-column-header", "forest-surface"]);
}

export async function openConflictDialog(page: Page): Promise<void> {
  await testId(page, "sync-button-trigger").click();
  await waitVisible(page, "conflict-dialog-profile-select");
}

export async function openTicketDetail(page: Page, folderName: string): Promise<void> {
  const card = testId(page, "kanban-board-ticket-card", { "data-folder-name": folderName });
  await card.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
  await card.click();
  await waitVisibleAny(page, ["ticket-detail-loading", "ticket-detail-tab-editor"]);
  try {
    await waitVisible(page, "ticket-detail-tab-editor");
  } catch {
    // The click can land while the board is still settling, which drops it.
    await card.click();
    await waitVisible(page, "ticket-detail-tab-editor");
  }
}

export async function openLauncherSettings(page: Page): Promise<void> {
  await testId(page, "project-header-settings-button").click();
  await page.locator('[data-scope="floating-panel"][data-part="content"]')
    .waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
  await waitVisible(page, "launcher-settings-tab-misc");
}

export type LauncherSettingsTab =
  | "misc" | "prompts" | "launch" | "columns" | "command-templates";

export async function openLauncherSettingsTab(page: Page, name: LauncherSettingsTab): Promise<void> {
  await testId(page, `launcher-settings-tab-${name}`).click();
  const contentTestId: Record<LauncherSettingsTab, string> = {
    launch: "launcher-settings-launch-add-profile-button",
    prompts: "launcher-settings-skills-add-button",
    misc: "launcher-settings-misc-project-name-input",
    columns: "launcher-settings-columns-board-selector",
    "command-templates": "command-template-list",
  };
  await waitVisible(page, contentTestId[name]);
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function boxOf(locator: Locator): Promise<ScreenBox> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const box = await locator.boundingBox();
    if (box) return box;
    if (Date.now() > deadline) throw new Error("Element has no bounding box");
    await new Promise((r) => setTimeout(r, 100));
  }
}

function boxCenter(box: ScreenBox): ScreenPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function centerOf(locator: Locator): Promise<ScreenPoint> {
  return boxCenter(await boxOf(locator));
}

export interface DragPointerOptions {
  steps?: number;
  stepDelayMs?: number;
  /** Held after pressing, before the first move, to let a drag sensor arm. */
  holdMs?: number;
  /** Held at the destination before releasing, to let the drop target settle. */
  settleMs?: number;
}

/**
 * The one mouse drag every suite uses. Drag-and-drop here is driven by pointer
 * events rather than the HTML drag protocol, so Playwright's dragTo cannot do it
 * and the move has to be stepped by hand.
 */
export async function dragPointer(
  page: Page,
  from: ScreenPoint,
  to: ScreenPoint,
  options: DragPointerOptions = {},
): Promise<void> {
  const steps = options.steps ?? 10;
  const stepDelayMs = options.stepDelayMs ?? 30;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (options.holdMs) await page.waitForTimeout(options.holdMs);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + (to.x - from.x) * (i / steps),
      from.y + (to.y - from.y) * (i / steps),
    );
    await page.waitForTimeout(stepDelayMs);
  }
  if (options.settleMs) await page.waitForTimeout(options.settleMs);
  await page.mouse.up();
}

export function sortableItem(page: Page, sortableId: string): Locator {
  return page.locator(`[data-sortable-id="${sortableId}"]`);
}

export interface DragElementOptions extends DragPointerOptions {
  /** "top" aims just inside the target's leading edge, to drop before it. */
  releaseAt?: "center" | "top";
}

/**
 * Drags one element onto another. Endpoints are Locators rather than selector
 * strings so a caller can aim at a sortable item, a drop zone or a drag handle
 * without this helper knowing how any of them are identified.
 */
export async function dragElement(
  page: Page,
  source: Locator,
  target: Locator,
  options: DragElementOptions = {},
): Promise<void> {
  await source.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
  await target.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
  const sourceBox = await boxOf(source);
  const targetBox = await boxOf(target);
  const to = options.releaseAt === "top"
    ? { x: targetBox.x + targetBox.width / 2, y: targetBox.y + 5 }
    : boxCenter(targetBox);
  await dragPointer(page, boxCenter(sourceBox), to, options);
}

export async function clickTicketMenuItem(
  page: Page,
  item: "edit" | "archive" | "delete",
): Promise<void> {
  const trigger = testId(page, "kanban-board-ticket-menu-trigger").first();
  await trigger.waitFor({ state: "visible", timeout: WAIT_TIMEOUT_MS });
  await trigger.click();
  const itemTestId = `kanban-board-ticket-menu-${item}`;
  await testId(page, itemTestId).waitFor({ state: "attached", timeout: WAIT_TIMEOUT_MS });
  // The menu closes on the pointer press that Playwright's click sends first,
  // so the item has to be activated directly.
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    if (!el) throw new Error(`${id} not in DOM`);
    el.click();
  }, itemTestId);
}

export interface ProjectEntry {
  path: string;
  projectSlug: string;
  name?: string;
  branch?: string;
  ticketsPath?: string;
  mainBranch?: string;
  boardId?: string;
}

export interface ProjectRegistry {
  projects: ProjectEntry[];
  lastUsedProjectSlug: string | null;
  lastUsedProfileName?: string | null;
}

export function readProjectRegistry(server: TestServer): ProjectRegistry {
  const file = path.join(server.dataDir, "config", "config.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as ProjectRegistry;
}

export interface LauncherConfigShape {
  templates?: { name: string; text: string; order?: number }[];
  skills?: { name: string; text: string; order?: number }[];
  profiles?: { name: string; command: string; order?: number }[];
  shortcuts?: { name: string; command: string; order?: number }[];
  columnDefaults?: Record<string, {
    templateName: string | null;
    checkedSkills: string[];
    profileName: string | null;
    lastLayer?: "editor" | "launcher" | "shortcuts";
    skillOrder?: string[];
    editedPrompt?: string;
  }>;
  worktreeRootPath?: string;
  branchPrefix?: string;
  conflictResolutionPrompt?: string;
}

export function readAppLauncherConfig(server: TestServer): LauncherConfigShape | null {
  const file = path.join(server.dataDir, "config", "launcher-config.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function readProjectLauncherConfig(
  server: TestServer, projectSlug: string,
): LauncherConfigShape | null {
  const file = path.join(server.dataDir, "projects", projectSlug, "config", "launcher-config.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export interface BoardDefinitionShape {
  id: string;
  name: string;
  columns: { name: string; description?: string; color?: string }[];
}

export function readBoardDefinitions(server: TestServer): BoardDefinitionShape[] {
  const file = path.join(server.dataDir, "config", "boards.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export interface StatusJsonShape {
  number: string;
  title: string;
  status: string;
  useWorktree: boolean;
  dependsOn?: string[];
  memberOf?: string;
}

export function readTicketStatus(
  server: TestServer,
  projectSlug: string,
  folderName: string,
): StatusJsonShape | null {
  const file = path.join(
    server.dataDir, "projects", projectSlug, "tickets", folderName, "status.json",
  );
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function readForestLayout(
  server: TestServer,
  projectSlug: string,
): Record<string, { x: number; y: number }> | null {
  const file = path.join(
    server.dataDir, "projects", projectSlug, "tickets", "forest-layout.json",
  );
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function listTicketFolders(server: TestServer, projectSlug: string): string[] {
  const dir = path.join(server.dataDir, "projects", projectSlug, "tickets");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== ".git")
    .map((d) => d.name);
}

export function worktreeExists(
  server: TestServer,
  projectSlug: string,
  folderName: string,
): boolean {
  const wt = path.join(
    server.dataDir, "projects", projectSlug, "worktrees", folderName,
  );
  return fs.existsSync(wt);
}

export async function getLocalStorageItem(page: Page, key: string): Promise<string | null> {
  return await page.evaluate((k) => {
    try { return window.localStorage.getItem(k); } catch { return null; }
  }, key);
}

export function ticketContextFile(
  server: TestServer,
  projectSlug: string,
  folderName: string,
  contextName: string,
): string {
  return path.join(
    server.dataDir, "projects", projectSlug, "tickets", folderName, `${contextName}.md`,
  );
}

export function readContextFile(
  server: TestServer,
  projectSlug: string,
  folderName: string,
  contextName: string,
): string | null {
  const file = ticketContextFile(server, projectSlug, folderName, contextName);
  if (!fs.existsSync(file)) return null;
  try {
    return fs.readFileSync(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function ticketFileNames(
  server: TestServer,
  projectSlug: string,
  folderName: string,
): string[] {
  const dir = path.join(
    server.dataDir, "projects", projectSlug, "tickets", folderName,
  );
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n !== "status.json" && !n.endsWith(".md"));
}

export async function poll<T>(
  fn: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

export interface E2EContext {
  testServer: TestServer;
  page: Page;
  newPage: () => Promise<Page>;
  projects: CreatedProject[];
}

export function setupE2E(opts: {
  viewport?: { width: number; height: number };
  serverOpts?: CreateServerOptions;
} = {}): E2EContext {
  const viewport = opts.viewport ?? { width: 1200, height: 800 };
  const ctx = { projects: [] as CreatedProject[] } as E2EContext;
  const extraPages: Page[] = [];
  let browser: Browser;
  beforeAll(async () => {
    ctx.testServer = await createServer(opts.serverOpts);
    browser = await chromium.launch({ headless: true });
  }, 60000);
  beforeEach(async () => {
    if (ctx.page && !ctx.page.isClosed()) {
      throw new Error(
        "setupE2E gives the whole file one page, so two of its tests cannot run at once."
        + " Drop .concurrent from this test, or open a second page with ctx.newPage().",
      );
    }
    ctx.page = await browser.newPage({ viewport });
  });
  ctx.newPage = async () => {
    const p = await browser.newPage({ viewport });
    extraPages.push(p);
    return p;
  };
  afterEach(async () => {
    for (const p of extraPages) {
      try { await p.context().close(); } catch (err) { console.warn("newPage cleanup:", err); }
    }
    extraPages.length = 0;
    await ctx.page?.close();
  });
  afterAll(async () => {
    await browser?.close();
    await ctx.testServer?.stop();
    for (const p of ctx.projects) p.cleanup();
  }, 20000);
  return ctx;
}

export interface OpenProjectOptions extends Omit<CreateProjectOptions, "projectSlug"> {
  /** Base for the generated projectSlug; uniqueSlug keeps it distinct per test. */
  slugBase: string;
  /** Fakes the clock before the first navigation, for Sync Pending polling tests. */
  fakeClock?: boolean;
}

/**
 * Seeds a Project and registers it for cleanup, without opening a page on it.
 * Ownership of the created Project stays with the fixture instead of being
 * re-established by each file.
 */
export async function seedProject(
  ctx: E2EContext,
  options: Omit<OpenProjectOptions, "fakeClock">,
): Promise<CreatedProject> {
  const { slugBase, ...createOptions } = options;
  const project = await createProject(ctx.testServer, {
    ...createOptions,
    projectSlug: uniqueSlug(slugBase),
  });
  ctx.projects.push(project);
  return project;
}

/** Seeds a Project and opens it. Where a test needs no setup between the two. */
export async function openProject(
  ctx: E2EContext,
  options: OpenProjectOptions,
): Promise<CreatedProject> {
  const { fakeClock, ...seedOptions } = options;
  const project = await seedProject(ctx, seedOptions);
  if (fakeClock) {
    await ctx.page.clock.install();
    await gotoProjectOnFakeClock(ctx.page, ctx.testServer, project.projectSlug);
  } else {
    await gotoProject(ctx.page, ctx.testServer, project.projectSlug);
  }
  return project;
}

export async function expectOpenConfigDirRequest(
  page: Page,
  trigger: () => Promise<void>,
): Promise<void> {
  const serverCall = page.waitForRequest((r) => r.url().includes("/_server"), { timeout: 5000 });
  await trigger();
  await serverCall;
}
