import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { pickPort } from "./test-port.js";
import { startRealServer, stopRealServer, type RealServer } from "./real-server.js";

export interface TestServer {
  server: RealServer;
  baseUrl: string;
  dataDir: string;
  port: number;
  /** Parent directory under which each project's tmp git repo is created. */
  reposParentDir: string;
  stop: () => Promise<void>;
}

export interface CreateServerOptions {
  env?: NodeJS.ProcessEnv;
  dataDirPrefix?: string;
}

export async function createServer(opts: CreateServerOptions = {}): Promise<TestServer> {
  const startPort = pickPort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), opts.dataDirPrefix ?? "cl-e2e-data-"));
  const reposParentDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-e2e-repos-"));
  const safeEnv: NodeJS.ProcessEnv = {
    CONTEXT_PICKER_STUB: "__cancel__",
    CONTEXT_FILE_PICKER_STUB: "__cancel__",
    CONTEXT_OPEN_IN_OS_STUB: "__noop__",
    ...(opts.env ?? {}),
  };
  const server = await startRealServer(startPort, dataDir, safeEnv);
  const resolvedPort = Number(new URL(server.baseUrl).port);
  return {
    server,
    baseUrl: server.baseUrl,
    dataDir,
    port: resolvedPort,
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

export interface TestBrowser {
  browser: Browser;
  stop: () => Promise<void>;
}

export async function launchBrowser(): Promise<TestBrowser> {
  const browser = await chromium.launch({ headless: true });
  return { browser, stop: async () => { await browser.close(); } };
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
}

export interface SeedBoard {
  id: string;
  name: string;
  columns: SeedColumn[];
}

export interface SeedAppLauncherConfig {
  templates?: { name: string; text: string }[];
  skills?: { name: string; text: string; order?: number }[];
  profiles?: { name: string; command: string }[];
  shortcuts?: { name: string; command: string }[];
  conflictResolutionPrompt?: string;
}

export interface CreateProjectOptions {
  /** Base name; the actual projectSlug is derived by the server from this. */
  projectSlug: string;
  withRemote?: boolean;
  withBoards?: SeedBoard[];
  withTickets?: SeedTicket[];
  withWorktrees?: { folderName: string }[];
  worktreeRootPath?: string;
  branch?: string;
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

function gitInitRepo(repoPath: string): void {
  execSync("git init -b main", { cwd: repoPath });
  execSync("git config user.email test@test.com", { cwd: repoPath });
  execSync("git config user.name Test", { cwd: repoPath });
  execSync("git commit --allow-empty -m init", { cwd: repoPath });
}

function setupBareRemote(repoPath: string, branch: string): string {
  const remoteDir = repoPath + "-remote.git";
  execSync(`git init --bare -b ${branch} "${remoteDir}"`, { cwd: os.tmpdir() });
  execSync(`git remote add origin "${remoteDir}"`, { cwd: repoPath });
  execSync("git push -u origin main", { cwd: repoPath });
  return remoteDir;
}

export async function createProject(
  server: TestServer,
  opts: CreateProjectOptions,
): Promise<CreatedProject> {
  const branch = opts.branch ?? "tickets";
  seedAppConfigFiles(server.dataDir, opts.withBoards, opts.appLauncherConfig);

  const projectPath = makeRepoDir(opts.projectSlug, server.reposParentDir);
  gitInitRepo(projectPath);

  let remoteUrl: string | null = null;
  if (opts.withRemote) {
    remoteUrl = setupBareRemote(projectPath, branch);
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
  registry.projects.push({
    path: canonicalProjectPath,
    projectSlug: opts.projectSlug,
    branch,
  });
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
    execSync(
      `git worktree add --orphan -b "${branch}" "${ticketsPath}"`,
      { cwd: projectPath },
    );
    execSync("git commit --allow-empty -m init", { cwd: ticketsPath });
  }

  if (opts.withRemote) {
    ensureTicketsWorktree();
    execSync(`git push -u origin "${branch}"`, { cwd: ticketsPath });
  }

  if (opts.withTickets && opts.withTickets.length > 0) {
    ensureTicketsWorktree();
    const useWorktreeFolders = new Set(
      (opts.withWorktrees ?? []).map((w) => w.folderName),
    );
    for (const t of opts.withTickets) {
      const folderName = t.folderName
        ?? toKebab(`${t.number}-${t.title}`);
      const folder = path.join(ticketsPath, folderName);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, "status.json"),
        JSON.stringify({
          number: t.number,
          title: t.title,
          status: t.status,
          useWorktree: t.useWorktree ?? useWorktreeFolders.has(folderName),
          ...(t.createdAt ? { createdAt: t.createdAt } : {}),
          ...(t.dependsOn ? { dependsOn: t.dependsOn } : {}),
          ...(t.memberOf ? { memberOf: t.memberOf } : {}),
        }, null, 2),
      );
      fs.writeFileSync(path.join(folder, "to-do.md"), t.body ?? "");
    }
    execSync("git add -A", { cwd: ticketsPath });
    execSync("git commit -m seed", { cwd: ticketsPath });
  }

  if (opts.withWorktrees && opts.withWorktrees.length > 0 && worktreeRootPath) {
    for (const w of opts.withWorktrees) {
      const wtPath = path.join(worktreeRootPath, w.folderName);
      const wtBranch = w.folderName;
      fs.mkdirSync(path.dirname(wtPath), { recursive: true });
      execSync(`git worktree add "${wtPath}" -b "${wtBranch}"`, { cwd: projectPath });
    }
  }

  const cleanup = () => {
    if (opts.withWorktrees && worktreeRootPath) {
      for (const w of opts.withWorktrees) {
        const wtPath = path.join(worktreeRootPath, w.folderName);
        if (!fs.existsSync(wtPath)) continue;
        try {
          execSync(`git worktree remove --force "${wtPath}"`, { cwd: projectPath });
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
    branch,
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

export async function gotoProject(page: Page, server: TestServer, projectSlug: string): Promise<void> {
  await page.goto(`${server.baseUrl}/project/${projectSlug}`);
  await page.waitForSelector('[data-testid="project-header-settings-button"]', {
    state: "visible",
    timeout: 15000,
  });
  // Wait for client hydration to finish so event handlers are live; a click fired
  // before this point is dropped (SSR markup is interactive-looking but inert).
  await page.waitForSelector('[data-hydrated="true"]', {
    state: "attached",
    timeout: 15000,
  });
  await page.waitForSelector(
    '[data-testid="kanban-board-column-header"], [data-testid="forest-surface"]',
    { state: "visible", timeout: 15000 },
  );
}

export async function openConflictDialog(page: Page): Promise<void> {
  await page.click('[data-testid="sync-button-trigger"]');
  await page.waitForSelector('[data-testid="conflict-dialog-profile-select"]', {
    state: "visible",
    timeout: 15000,
  });
}

export async function openTicketDetail(page: Page, folderName: string): Promise<void> {
  const card = page.locator(`[data-testid="kanban-board-ticket-card"][data-folder-name="${folderName}"]`);
  await card.waitFor({ state: "visible", timeout: 15000 });
  await card.click();
  try {
    await page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "visible",
      timeout: 15000,
    });
  } catch {
    await card.click();
    await page.waitForSelector('[data-testid="ticket-detail-tab-editor"]', {
      state: "visible",
      timeout: 15000,
    });
  }
}

export async function openLauncherSettings(page: Page): Promise<void> {
  await page.click('[data-testid="project-header-settings-button"]');
  await page.waitForSelector('[data-scope="floating-panel"][data-part="content"]', {
    state: "visible",
    timeout: 15000,
  });
  await page.waitForSelector('[data-testid="launcher-settings-tab-misc"]', {
    state: "visible",
    timeout: 15000,
  });
}

export type LauncherSettingsTab = "misc" | "prompts" | "launch" | "columns";

export async function openLauncherSettingsTab(page: Page, name: LauncherSettingsTab): Promise<void> {
  await page.click(`[data-testid="launcher-settings-tab-${name}"]`);
  const contentTestId: Record<LauncherSettingsTab, string> = {
    launch: "launcher-settings-launch-add-profile-button",
    prompts: "launcher-settings-skills-add-button",
    misc: "launcher-settings-misc-project-name-input",
    columns: "launcher-settings-columns-board-selector",
  };
  await page.waitForSelector(`[data-testid="${contentTestId[name]}"]`, {
    state: "visible",
    timeout: 15000,
  });
}

export interface DragSortableOptions {
  releaseAt?: "center" | "top";
}

export async function dragSortable(
  page: Page,
  fromSelector: string,
  toSelector: string,
  options: DragSortableOptions = {},
): Promise<void> {
  const source = page.locator(fromSelector);
  const target = page.locator(toSelector);
  const sBox = await source.boundingBox();
  const tBox = await target.boundingBox();
  if (!sBox || !tBox) {
    throw new Error(`dragSortable: missing bounding box for ${fromSelector} or ${toSelector}`);
  }
  const sx = sBox.x + sBox.width / 2;
  const sy = sBox.y + sBox.height / 2;
  const tx = tBox.x + tBox.width / 2;
  const ty = options.releaseAt === "top" ? tBox.y + 5 : tBox.y + tBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(150);
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(sx + (tx - sx) * (i / 20), sy + (ty - sy) * (i / 20));
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

export async function selectMenuItem(
  page: Page,
  triggerTestId: string,
  itemText: string,
): Promise<void> {
  await page.locator(`[data-testid="${triggerTestId}"]`).click();
  await page.waitForTimeout(200);
  await page.locator('[role="menuitem"]', { hasText: itemText }).first().click();
  await page.waitForTimeout(100);
}

export async function clickTicketMenuItem(
  page: Page,
  item: "edit" | "archive" | "delete",
): Promise<void> {
  const trigger = page.locator('[data-testid="kanban-board-ticket-menu-trigger"]').first();
  await trigger.waitFor({ state: "visible", timeout: 10000 });
  await trigger.click();
  const testId = `kanban-board-ticket-menu-${item}`;
  await page.locator(`[data-testid="${testId}"]`).waitFor({ state: "attached", timeout: 10000 });
  await page.evaluate((tid) => {
    const el = document.querySelector(`[data-testid="${tid}"]`) as HTMLElement | null;
    if (!el) throw new Error(`${tid} not in DOM`);
    el.click();
  }, testId);
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
  templates?: { name: string; text: string }[];
  skills?: { name: string; text: string; order?: number }[];
  profiles?: { name: string; command: string }[];
  shortcuts?: { name: string; command: string }[];
  columnDefaults?: Record<string, {
    templateName: string | null;
    checkedSkills: string[];
    profileName: string | null;
    skillOrder?: string[];
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
  columns: { name: string; description?: string }[];
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

export function gitBranches(repoPath: string): string[] {
  const out = execSync("git branch --list", { cwd: repoPath, encoding: "utf-8" });
  return out.split("\n").map((l) => l.replace(/^[\s*]+/, "").trim()).filter(Boolean);
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
  return fs.readFileSync(file, "utf-8");
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
  fn: () => T,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  intervalMs = 500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = fn();
  while (!predicate(last)) {
    if (Date.now() > deadline) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
    last = fn();
  }
  return last;
}

export interface E2EContext {
  testServer: TestServer;
  testBrowser: TestBrowser;
  browser: Browser;
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
  beforeAll(async () => {
    ctx.testServer = await createServer(opts.serverOpts);
    ctx.testBrowser = await launchBrowser();
    ctx.browser = ctx.testBrowser.browser;
  }, 60000);
  beforeEach(async () => {
    ctx.page = await ctx.browser.newPage({ viewport });
  });
  ctx.newPage = async () => {
    const p = await ctx.browser.newPage({ viewport });
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
    await ctx.testBrowser?.stop();
    await ctx.testServer?.stop();
    for (const p of ctx.projects) p.cleanup();
  }, 20000);
  return ctx;
}

export async function expectOpenConfigDirRequest(
  page: Page,
  trigger: () => Promise<void>,
): Promise<void> {
  let called = false;
  const handler = (r: import("playwright").Request) => {
    if (r.url().includes("/_server")) called = true;
  };
  page.on("request", handler);
  try {
    await trigger();
    await page.waitForTimeout(500);
    if (!called) throw new Error("expected server function request, none observed");
  } finally {
    page.off("request", handler);
  }
}
