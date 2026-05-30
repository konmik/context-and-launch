export function normalizeMacPickedPath(stdout: string): string {
	const trimmed = stdout.trim();
	if (trimmed === "/") return "/";
	return trimmed.replace(/\/$/, "");
}
