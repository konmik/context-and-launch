import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestCommandTemplateService } from "../command-template/command-template.test-utils.js";
import { git } from "../../test-git.js";
import { makeTempDir, removeTempDirOrWarn } from "../../test-temp.js";
import { DiffReviewGitService } from "./diff-review-git.js";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map(removeTempDirOrWarn));
});

async function createRepository(): Promise<string> {
	const repoDir = makeTempDir("diff-review-git-");
	dirs.push(repoDir);
	await git(repoDir, "init", "-b", "main");
	await git(repoDir, "config", "user.email", "test@example.com");
	await git(repoDir, "config", "user.name", "Test");
	await git(repoDir, "config", "core.autocrlf", "false");
	fs.writeFileSync(path.join(repoDir, "tracked.txt"), "base\n");
	await git(repoDir, "add", "tracked.txt");
	await git(repoDir, "commit", "-m", "base");
	await git(repoDir, "checkout", "-b", "feature");
	return repoDir;
}

describe("DiffReviewGitService", () => {
	it("separates All, Branch, Uncommitted, and Last Commit scopes", async () => {
		const repoDir = await createRepository();
		const service = new DiffReviewGitService(createTestCommandTemplateService());
		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "working\n");
		fs.writeFileSync(path.join(repoDir, "staged.txt"), "staged\n");
		await git(repoDir, "add", "staged.txt");
		fs.writeFileSync(path.join(repoDir, "untracked.txt"), "untracked\n");
		const target = {
			worktreePath: repoDir,
			worktreeIdentity: "worktree",
			mainBranch: "main",
		};

		const working = await service.loadSnapshot(target, "working");
		expect(working.files.map((file) => file.path)).toEqual([
			"staged.txt",
			"tracked.txt",
			"untracked.txt",
		]);
		const lastCommit = await service.loadSnapshot(target, "last-commit");
		expect(lastCommit.files.map((file) => file.path)).toEqual(["tracked.txt"]);
		expect(lastCommit.files[0].newContents).toBe("base\n");

		await git(repoDir, "add", "-A");
		await git(repoDir, "commit", "-m", "feature");
		fs.writeFileSync(path.join(repoDir, "after-commit.txt"), "working after commit\n");

		const all = await service.loadSnapshot(target, "all");
		expect(all.files.map((file) => file.path)).toEqual([
			"after-commit.txt",
			"staged.txt",
			"tracked.txt",
			"untracked.txt",
		]);
		const branch = await service.loadSnapshot(target, "branch");
		expect(branch.files.map((file) => file.path)).toEqual([
			"staged.txt",
			"tracked.txt",
			"untracked.txt",
		]);
		expect(branch.files.find((file) => file.path === "tracked.txt")?.newContents)
			.toBe("working\n");
		const committed = await service.loadSnapshot(target, "last-commit");
		expect(committed.files.some((file) => file.path === "after-commit.txt")).toBe(false);
	});

	it("compares base revisions in the working tree line-ending representation", async () => {
		const repoDir = makeTempDir("diff-review-eol-");
		dirs.push(repoDir);
		await git(repoDir, "init", "-b", "main");
		await git(repoDir, "config", "user.email", "test@example.com");
		await git(repoDir, "config", "user.name", "Test");
		await git(repoDir, "config", "core.autocrlf", "false");
		fs.writeFileSync(path.join(repoDir, ".gitattributes"), "*.txt text eol=crlf\n");
		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "one\r\ntwo\r\nthree\r\n");
		await git(repoDir, "add", "-A");
		await git(repoDir, "commit", "-m", "base");
		await git(repoDir, "checkout", "-b", "feature");
		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "one\r\ntwo changed\r\nthree\r\n");
		await git(repoDir, "add", "-A");
		await git(repoDir, "commit", "-m", "feature");

		const service = new DiffReviewGitService(createTestCommandTemplateService());
		const snapshot = await service.loadSnapshot({
			worktreePath: repoDir,
			worktreeIdentity: "worktree",
			mainBranch: "main",
		}, "all");
		const file = snapshot.files.find((entry) => entry.path === "tracked.txt");
		expect(file?.additions).toBe(1);
		expect(file?.deletions).toBe(1);
	});

	it("does not show a whole CRLF file as rewritten when the working tree drops its carriage returns", async () => {
		const repoDir = makeTempDir("diff-review-eol-mixed-");
		dirs.push(repoDir);
		await git(repoDir, "init", "-b", "main");
		await git(repoDir, "config", "user.email", "test@example.com");
		await git(repoDir, "config", "user.name", "Test");
		await git(repoDir, "config", "core.autocrlf", "false");
		fs.writeFileSync(path.join(repoDir, ".gitattributes"), "*.txt text eol=crlf\n");
		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "one\r\ntwo\r\nthree\r\n");
		await git(repoDir, "add", "-A");
		await git(repoDir, "commit", "-m", "base");
		await git(repoDir, "checkout", "-b", "feature");
		fs.writeFileSync(path.join(repoDir, "tracked.txt"), "one\ntwo changed\nthree\n");

		const service = new DiffReviewGitService(createTestCommandTemplateService());
		const snapshot = await service.loadSnapshot({
			worktreePath: repoDir,
			worktreeIdentity: "worktree",
			mainBranch: "main",
		}, "working");
		const file = snapshot.files.find((entry) => entry.path === "tracked.txt");
		expect(file?.additions).toBe(1);
		expect(file?.deletions).toBe(1);
		expect(file?.lines.some((line) => line.text.includes("\r"))).toBe(false);
	});

	it("keeps invalid UTF-8 assets non-selectable without requiring a NUL byte", async () => {
		const repoDir = await createRepository();
		fs.writeFileSync(path.join(repoDir, "asset.bin"), Buffer.from([0xff, 0xfe, 0xfd, 0xfc]));
		const service = new DiffReviewGitService(createTestCommandTemplateService());

		const snapshot = await service.loadSnapshot({
			worktreePath: repoDir,
			worktreeIdentity: "worktree",
			mainBranch: "main",
		}, "working");

		expect(snapshot.files[0].binary).toBe(true);
		expect(snapshot.files[0].lines).toEqual([]);
	});

	it("reports a missing configured main branch instead of substituting a scope", async () => {
		const repoDir = await createRepository();
		const service = new DiffReviewGitService(createTestCommandTemplateService());
		await expect(service.loadSnapshot({
			worktreePath: repoDir,
			worktreeIdentity: "worktree",
		}, "branch")).rejects.toThrow("configured main branch");
	});
});
