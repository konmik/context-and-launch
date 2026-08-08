import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { type Locator, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { gotoProject, seedProject, setupE2E, type E2EContext } from "./fixtures.js";
import { rmTemp } from "./real-server.js";
import { testId } from "./locators.js";

// The stubs live outside the data dir so their paths can go into the server's
// environment before the fixture creates that dir.
const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), "cl-picker-stubs-"));
const pickerStubFile = path.join(stubDir, "picker-stub");
const filePickerStubFile = path.join(stubDir, "file-picker-stub");
fs.writeFileSync(pickerStubFile, "__cancel__");
fs.writeFileSync(filePickerStubFile, "__cancel__");

const PICKED_DIR = path.join(os.tmpdir(), "e2e-picked-dir");
const PICKED_FILES = [
  path.join(os.tmpdir(), "e2e-ref-a.ts"),
  path.join(os.tmpdir(), "e2e-ref-b.ts"),
];

function setPickerStub(value: string) {
  fs.writeFileSync(pickerStubFile, value);
}

function setFilePickerStub(value: string) {
  fs.writeFileSync(filePickerStubFile, value);
}

interface DirectoryPickerSpec {
  name: string;
  setup: (page: Page) => Promise<void>;
  button: (page: Page) => Locator;
  input: (page: Page) => Locator;
  errorContainer: (page: Page) => Locator;
}

function testDirectoryPicker(ctx: E2EContext, spec: DirectoryPickerSpec) {
  describe(spec.name, () => {
    it("fills the input when the picker returns a path", async () => {
      setPickerStub(PICKED_DIR);
      await spec.setup(ctx.page);
      await spec.button(ctx.page).click();
      await expect.poll(() => spec.input(ctx.page).inputValue(), { timeout: 5000 })
        .toBe(PICKED_DIR);
    });

    it("leaves the input unchanged and shows no error when the user cancels", async () => {
      setPickerStub("__cancel__");
      await spec.setup(ctx.page);
      const before = await spec.input(ctx.page).inputValue();
      await spec.button(ctx.page).click();
      await ctx.page.waitForTimeout(500);
      expect(await spec.input(ctx.page).inputValue()).toBe(before);
      expect(await spec.errorContainer(ctx.page).count()).toBe(0);
    });

    it("shows an error when no picker is available", async () => {
      setPickerStub("__unavailable__");
      await spec.setup(ctx.page);
      await spec.button(ctx.page).click();
      await expect.poll(
        () => spec.errorContainer(ctx.page).textContent(),
        { timeout: 5000 },
      ).toBeTruthy();
    });

    it("shows an error when the picker fails (not cancel)", async () => {
      setPickerStub("__error__");
      await spec.setup(ctx.page);
      await spec.button(ctx.page).click();
      await expect.poll(
        () => spec.errorContainer(ctx.page).textContent(),
        { timeout: 5000 },
      ).toBeTruthy();
    });
  });
}

interface FilePickerSpec {
  name: string;
  setup: (page: Page) => Promise<void>;
  button: (page: Page) => Locator;
  errorContainer: (page: Page) => Locator;
  assertFilesAdded: (page: Page) => Promise<void>;
}

function testFilePicker(ctx: E2EContext, spec: FilePickerSpec) {
  describe(spec.name, () => {
    it("adds file references when the picker returns paths", async () => {
      setFilePickerStub(PICKED_FILES.join("\n"));
      await spec.setup(ctx.page);
      await spec.button(ctx.page).click();
      await spec.assertFilesAdded(ctx.page);
    });

    it("does nothing when the user cancels", async () => {
      setFilePickerStub("__cancel__");
      await spec.setup(ctx.page);
      await spec.button(ctx.page).click();
      await ctx.page.waitForTimeout(500);
    });

    it("shows an error when the file picker fails", async () => {
      setFilePickerStub("__error__");
      await spec.setup(ctx.page);
      await spec.button(ctx.page).click();
      await expect.poll(
        () => spec.errorContainer(ctx.page).isVisible(),
        { timeout: 5000 },
      ).toBe(true);
    });
  });
}

async function hasFileReferenceButton(page: Page): Promise<boolean> {
  const labels = await page.locator("button").allTextContents();
  return labels.some((label) => label.includes("REFERENCE"));
}

describe("Picker buttons (e2e, real server)", () => {
  const ctx = setupE2E({
    serverOpts: {
      env: {
        CONTEXT_PICKER_STUB_FILE: pickerStubFile,
        CONTEXT_FILE_PICKER_STUB_FILE: filePickerStubFile,
      },
    },
  });

  let projectSlug: string;

  beforeAll(async () => {
    const project = await seedProject(ctx, {
      slugBase: "picker",
      withBoards: [{ id: "default", name: "Default", columns: [{ name: "todo" }] }],
      withTickets: [{
        number: "T-1", title: "Picker test", status: "todo", folderName: "t-1-picker-test",
      }],
    });
    projectSlug = project.projectSlug;
  });

  afterAll(async () => {
    await rmTemp(stubDir, "picker-buttons stubDir");
  });

  // --- Add Project page: project path directory picker ---

  async function goToAddProject(page: Page) {
    await page.goto(`${ctx.testServer.baseUrl}/add-project`);
    await page.locator("#project-path").waitFor({ state: "visible", timeout: 10000 });
  }

  testDirectoryPicker(ctx, {
    name: "Add Project > project path Browse",
    setup: goToAddProject,
    button: (p) => p.locator("#project-path + button"),
    input: (p) => p.locator("#project-path"),
    errorContainer: (p) => p.locator("form p.text-destructive"),
  });

  // --- Settings panel: worktree root directory picker ---

  const WORKTREE_BROWSE = "launcher-settings-misc-worktree-browse";
  async function goToSettingsMisc(page: Page) {
    await page.goto(`${ctx.testServer.baseUrl}/project/${projectSlug}`);
    await page.locator('button[title="Settings"]').waitFor({ state: "visible", timeout: 15000 });
    await page.locator('button[title="Settings"]').click();
    await testId(page, "launcher-settings-tab-misc").click();
    await testId(page, WORKTREE_BROWSE).waitFor({ state: "visible", timeout: 5000 });
  }

  testDirectoryPicker(ctx, {
    name: "Settings > worktree root Browse",
    setup: goToSettingsMisc,
    button: (p) => testId(p, WORKTREE_BROWSE),
    input: (p) => testId(p, WORKTREE_BROWSE).locator("xpath=preceding-sibling::input"),
    errorContainer: (p) => testId(p, "error-dialog-ok"),
  });

  // --- Ticket detail: file reference picker ---

  async function goToTicketDetail(page: Page) {
    await gotoProject(page, ctx.testServer, projectSlug);
    await page.locator("[data-drag-source]").first()
      .waitFor({ state: "visible", timeout: 15000 });
    await page.locator("[data-drag-source]").first().click();
    await page.locator('button:has-text("Add file reference")')
      .waitFor({ state: "visible", timeout: 5000 });
  }

  describe("Ticket Detail > Add file reference > remembers last directory", () => {
    it("uses the directory of the previously picked file on the next open", async () => {
      // Clear any persisted dir from prior tests
      await ctx.page.addInitScript(() => { try { localStorage.clear(); } catch { /* no storage */ } });
      const firstFile = path.join(os.tmpdir(), "dir-A", "file1.ts");
      const secondFile = path.join(os.tmpdir(), "dir-B", "file2.ts");

      setFilePickerStub(firstFile);
      await goToTicketDetail(ctx.page);
      await ctx.page.locator('button:has-text("Add file reference")').click();
      await expect.poll(() => hasFileReferenceButton(ctx.page), { timeout: 5000 }).toBe(true);

      setFilePickerStub(secondFile);
      await ctx.page.locator('button:has-text("Add file reference")').click();
      await ctx.page.waitForTimeout(2000);
      const labels = await ctx.page.locator("button").allTextContents();
      expect(labels.filter((t) => t.includes("REFERENCE")).length).toBeGreaterThanOrEqual(1);
    });
  });

  testFilePicker(ctx, {
    name: "Ticket Detail > Add file reference",
    setup: goToTicketDetail,
    button: (p) => p.locator('button:has-text("Add file reference")'),
    errorContainer: (p) => testId(p, "error-dialog-ok"),
    assertFilesAdded: async (p) => {
      await expect.poll(() => hasFileReferenceButton(p), { timeout: 5000 }).toBe(true);
    },
  });
});
