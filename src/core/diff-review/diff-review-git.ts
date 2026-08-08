import fs from "node:fs";
import path from "node:path";
import type { CommandTemplateExecutor } from "../command-template/command-template-types.js";
import { mapConcurrent } from "../shared/concurrency.js";
import {
	buildBinaryReviewFile,
	buildReviewFile,
	reviewContentHash,
} from "./diff-review-model.js";
import type {
	DiffScope,
	ReviewFileChangeType,
	ReviewFileSnapshot,
	ReviewSnapshot,
} from "./diff-review-types.js";

interface ChangedPath {
	status: string;
	path: string;
	previousPath?: string;
	changeType: ReviewFileChangeType;
}

export interface DiffReviewTarget {
	worktreePath: string;
	worktreeIdentity: string;
	mainBranch?: string;
}

function parseZeroSeparated(value: string): string[] {
	const parts = value.split("\0");
	if (parts.at(-1) === "") parts.pop();
	return parts;
}

export function parseNameStatus(value: string): ChangedPath[] {
	const parts = parseZeroSeparated(value);
	const files: ChangedPath[] = [];
	for (let index = 0; index < parts.length;) {
		const status = parts[index++];
		if (!status) throw new Error("Git returned an empty Diff Review status.");
		const code = status[0];
		if (code === "R" || code === "C") {
			const previousPath = parts[index++];
			const filePath = parts[index++];
			if (!previousPath || !filePath) {
				throw new Error(`Git returned an incomplete ${code === "R" ? "rename" : "copy"} status.`);
			}
			files.push({
				status,
				path: filePath,
				previousPath,
				changeType: code === "R" ? "renamed" : "copied",
			});
			continue;
		}
		const filePath = parts[index++];
		if (!filePath) throw new Error(`Git returned an incomplete '${status}' status.`);
		const changeType: ReviewFileChangeType =
			code === "A" ? "added"
				: code === "D" ? "deleted"
					: code === "T" ? "type-changed"
						: "modified";
		files.push({ status, path: filePath, changeType });
	}
	return files;
}

function assertContained(worktreePath: string, filePath: string): string {
	const root = path.resolve(worktreePath);
	const resolved = path.resolve(root, filePath);
	const rootWithSeparator = root.endsWith(path.sep) ? root : root + path.sep;
	const normalizedRoot = process.platform === "win32" ? rootWithSeparator.toLowerCase() : rootWithSeparator;
	const normalizedFile = process.platform === "win32" ? resolved.toLowerCase() : resolved;
	if (!normalizedFile.startsWith(normalizedRoot)) {
		throw new Error(`Diff Review path escapes the Agent Worktree: ${filePath}`);
	}
	return resolved;
}

function readWorkingFile(worktreePath: string, filePath: string): Buffer {
	const resolved = assertContained(worktreePath, filePath);
	const stats = fs.lstatSync(resolved);
	if (stats.isSymbolicLink()) return Buffer.from(fs.readlinkSync(resolved), "utf8");
	if (!stats.isFile()) throw new Error(`Diff Review cannot read non-file path: ${filePath}`);
	return fs.readFileSync(resolved);
}

function isBinary(contents: Buffer): boolean {
	return contents.includes(0);
}

function revisionFor(head: string, files: ReviewFileSnapshot[]): string {
	return reviewContentHash(
		head,
		files.map((file) => `${file.path}:${file.contentHash}`).join("\n"),
	);
}

const BLOB_CACHE_LIMIT = 1024;

export class DiffReviewGitService {
	constructor(private readonly commands: CommandTemplateExecutor) {}

	private readonly blobCache = new Map<string, Buffer>();

	private async readBlob(
		worktreePath: string,
		commitIdentity: string,
		refPath: string,
		blobPath: string,
	): Promise<Buffer> {
		const key = `${commitIdentity}:${blobPath}`;
		const cached = this.blobCache.get(key);
		if (cached) return cached;
		const contents = Buffer.from(await this.commands.execute(
			"diff-review.file.read",
			worktreePath,
			{ refPath },
		), "utf8");
		if (this.blobCache.size >= BLOB_CACHE_LIMIT) {
			const oldest = this.blobCache.keys().next();
			if (!oldest.done) this.blobCache.delete(oldest.value);
		}
		this.blobCache.set(key, contents);
		return contents;
	}

	async loadSnapshot(
		target: DiffReviewTarget,
		scope: DiffScope,
	): Promise<Omit<ReviewSnapshot, "reviewedLineIds">> {
		if (!fs.existsSync(target.worktreePath)) {
			throw new Error(`Agent Worktree does not exist: ${target.worktreePath}`);
		}
		// The HEAD revision does not gate the file list, so both reads run together.
		const [head, { baseRef, changed }] = await Promise.all([
			this.commands.execute("diff-review.head.resolve", target.worktreePath)
				.then((out) => out.trim()),
			this.resolveChanged(target, scope),
		]);
		if (!head) throw new Error("Git did not return an Agent Worktree HEAD revision.");

		const readNewFromWorktree = scope === "all" || scope === "working";
		const baseIdentity = baseRef === "HEAD"
			? head
			: baseRef === "HEAD^" ? `${head}^` : baseRef;
		const files = await mapConcurrent(changed, 8, (file) =>
			this.loadFile(
				target.worktreePath, file, baseRef, baseIdentity, head, readNewFromWorktree,
			));
		files.sort((left, right) => left.path.localeCompare(right.path));
		return {
			scope,
			capturedAt: new Date().toISOString(),
			revision: revisionFor(head, files),
			worktreeIdentity: target.worktreeIdentity,
			files,
		};
	}

	private async resolveChanged(
		target: DiffReviewTarget,
		scope: DiffScope,
	): Promise<{ baseRef: string; changed: ChangedPath[] }> {
		if (scope === "last-commit") {
			return {
				baseRef: "HEAD^",
				changed: parseNameStatus(await this.commands.execute(
					"diff-review.last-commit.files",
					target.worktreePath,
				)),
			};
		}
		if (scope === "branch") {
			const baseRef = await this.resolveMergeBase(target, scope);
			return {
				baseRef,
				changed: parseNameStatus(await this.commands.execute(
					"diff-review.branch.files",
					target.worktreePath,
					{ baseRef },
				)),
			};
		}

		const baseRef = scope === "working"
			? "HEAD"
			: await this.resolveMergeBase(target, scope);
		const [trackedOut, untrackedOut] = await Promise.all([
			this.commands.execute("diff-review.tracked.files", target.worktreePath, { baseRef }),
			this.commands.execute("diff-review.untracked.files", target.worktreePath),
		]);
		const changed = parseNameStatus(trackedOut);
		const trackedPaths = new Set(changed.map((file) => file.path));
		for (const filePath of parseZeroSeparated(untrackedOut)) {
			if (!trackedPaths.has(filePath)) {
				changed.push({ status: "A", path: filePath, changeType: "added" });
			}
		}
		return { baseRef, changed };
	}

	private async resolveMergeBase(
		target: DiffReviewTarget,
		scope: DiffScope,
	): Promise<string> {
		if (!target.mainBranch) {
			throw new Error(
				`${scope === "all" ? "All Changes" : "Branch Changes"}`
				+ " requires a configured main branch.",
			);
		}
		const baseRef = (await this.commands.execute(
			"diff-review.merge-base.resolve",
			target.worktreePath,
			{ mainBranch: target.mainBranch },
		)).trim();
		if (!baseRef) {
			throw new Error(`No merge-base is available for '${target.mainBranch}'.`);
		}
		return baseRef;
	}

	private async loadFile(
		worktreePath: string,
		file: ChangedPath,
		baseRef: string,
		baseIdentity: string,
		head: string,
		readNewFromWorktree: boolean,
	): Promise<ReviewFileSnapshot> {
		const code = file.status[0];
		const basePath = file.previousPath ?? file.path;
		const oldContents = code === "A"
			? Buffer.alloc(0)
			: await this.readBlob(
				worktreePath, baseIdentity, `${baseRef}:${basePath}`, basePath,
			);
		let newContents: Buffer;
		if (code === "D") {
			newContents = Buffer.alloc(0);
		} else if (readNewFromWorktree) {
			try {
				newContents = readWorkingFile(worktreePath, file.path);
			} catch (error) {
				if (code === "T") {
					return buildBinaryReviewFile({
						path: file.path,
						previousPath: file.previousPath,
						changeType: file.changeType,
						byteSize: 0,
						contentIdentity: `${file.status}:${oldContents.length}`,
					});
				}
				throw error;
			}
		} else {
			newContents = await this.readBlob(
				worktreePath, head, `HEAD:${file.path}`, file.path,
			);
		}

		if (isBinary(oldContents) || isBinary(newContents)) {
			return buildBinaryReviewFile({
				path: file.path,
				previousPath: file.previousPath,
				changeType: file.changeType,
				byteSize: newContents.length || oldContents.length,
				contentIdentity: `${file.status}:${oldContents.length}:${newContents.length}`,
			});
		}
		return buildReviewFile({
			path: file.path,
			previousPath: file.previousPath,
			changeType: file.changeType,
			oldContents: oldContents.toString("utf8"),
			newContents: newContents.toString("utf8"),
			byteSize: newContents.length || oldContents.length,
		});
	}
}
