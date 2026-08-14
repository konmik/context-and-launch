export interface DiffReviewFileTreeDirectory {
	kind: "directory";
	directoryPath: string;
	name: string;
	children: DiffReviewFileTreeNode[];
}

export interface DiffReviewFileTreeFile {
	kind: "file";
	filePath: string;
	name: string;
}

export type DiffReviewFileTreeNode =
	| DiffReviewFileTreeDirectory
	| DiffReviewFileTreeFile;

interface MutableDirectory {
	directoryPath: string;
	name: string;
	directories: Map<string, MutableDirectory>;
	files: DiffReviewFileTreeFile[];
}

function materializeDirectory(directory: MutableDirectory): DiffReviewFileTreeNode[] {
	const directories = [...directory.directories.values()]
		.sort((left, right) => left.name.localeCompare(right.name))
		.map((child): DiffReviewFileTreeDirectory => ({
			kind: "directory",
			directoryPath: child.directoryPath,
			name: child.name,
			children: materializeDirectory(child),
		}));
	const files = [...directory.files]
		.sort((left, right) => left.name.localeCompare(right.name));
	return [...directories, ...files];
}

export function buildDiffReviewFileTree(
	filePaths: readonly string[],
): DiffReviewFileTreeNode[] {
	const root: MutableDirectory = {
		directoryPath: "",
		name: "",
		directories: new Map(),
		files: [],
	};

	for (const filePath of filePaths) {
		const parts = filePath.split("/");
		const name = parts.pop();
		if (!name || parts.some((part) => !part)) {
			throw new Error(`Invalid Diff Review file path: ${filePath}`);
		}

		let directory = root;
		let directoryPath = "";
		for (const part of parts) {
			directoryPath = directoryPath ? `${directoryPath}/${part}` : part;
			let child = directory.directories.get(part);
			if (!child) {
				child = {
					directoryPath,
					name: part,
					directories: new Map(),
					files: [],
				};
				directory.directories.set(part, child);
			}
			directory = child;
		}
		directory.files.push({ kind: "file", filePath, name });
	}

	return materializeDirectory(root);
}

export function diffReviewFilePathsInTreeOrder(
	nodes: readonly DiffReviewFileTreeNode[],
): string[] {
	return nodes.flatMap((node) => node.kind === "file"
		? [node.filePath]
		: diffReviewFilePathsInTreeOrder(node.children));
}
