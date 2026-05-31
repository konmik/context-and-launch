import { execFile } from "child_process";
import { readFileSync } from "fs";
import { withService } from "~/server/shared/route-helpers.js";
import { normalizeMacPickedPath } from "~/server/infra/picker-paths.js";

type PickerResult =
	| { kind: "picked"; path: string }
	| { kind: "cancelled" }
	| { kind: "errored"; message: string }
	| { kind: "unavailable" };

function runWindowsPicker(exe: string, encoded: string): Promise<PickerResult> {
	return new Promise((resolve) => {
		execFile(
			exe,
			["-STA", "-NoProfile", "-EncodedCommand", encoded],
			{ timeout: 600000 },
			(err, stdout, stderr) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						resolve({ kind: "unavailable" });
						return;
					}
					if ((err as { code?: number }).code === 1) {
						resolve({ kind: "cancelled" });
						return;
					}
					resolve({
						kind: "errored",
						message: stderr.trim() || (err as Error).message,
					});
					return;
				}
				const picked = stdout.trim();
				if (!picked) {
					resolve({ kind: "cancelled" });
					return;
				}
				resolve({ kind: "picked", path: picked });
			},
		);
	});
}

function buildWindowsPickerScript(preselect: string): string {
	const initialDir = preselect
		? `$d.InitialDirectory = '${preselect.replace(/'/g, "''")}'\n`
		: "";
	return `
Add-Type -AssemblyName PresentationFramework
$d = New-Object Microsoft.Win32.OpenFolderDialog
$d.Title = 'Select directory'
${initialDir}if ($d.ShowDialog()) { $d.FolderName } else { exit 1 }
`;
}

function runMacPicker(preselect: string): Promise<PickerResult> {
	const escaped = preselect.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const defaultLoc = preselect
		? ` default location POSIX file "${escaped}"`
		: "";
	const script =
		`POSIX path of (choose folder with prompt "Select directory"${defaultLoc})`;
	return new Promise((resolve) => {
		execFile(
			"osascript",
			["-e", script],
			{ timeout: 600000 },
			(err, stdout, stderr) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						resolve({ kind: "unavailable" });
						return;
					}
					if (/-128|User canceled|User cancelled/.test(stderr)) {
						resolve({ kind: "cancelled" });
						return;
					}
					resolve({
						kind: "errored",
						message: stderr.trim() || (err as Error).message,
					});
					return;
				}
				resolve({ kind: "picked", path: normalizeMacPickedPath(stdout) });
			},
		);
	});
}

function runZenity(preselect: string): Promise<PickerResult> {
	const args = ["--file-selection", "--directory", "--title=Select directory"];
	if (preselect) args.push(`--filename=${preselect.replace(/\/?$/, "/")}`);
	return new Promise((resolve) => {
		execFile("zenity", args, { timeout: 600000 }, (err, stdout, stderr) => {
			if (err) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT") {
					resolve({ kind: "unavailable" });
					return;
				}
				if ((err as { code?: number }).code === 1) {
					resolve({ kind: "cancelled" });
					return;
				}
				resolve({
					kind: "errored",
					message: stderr.trim() || (err as Error).message,
				});
				return;
			}
			resolve({ kind: "picked", path: stdout.trim() });
		});
	});
}

function runKdialog(preselect: string): Promise<PickerResult> {
	const start = preselect || process.env.HOME || "/";
	return new Promise((resolve) => {
		execFile(
			"kdialog",
			["--getexistingdirectory", start],
			{ timeout: 600000 },
			(err, stdout, stderr) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						resolve({ kind: "unavailable" });
						return;
					}
					if ((err as { code?: number }).code === 1) {
						resolve({ kind: "cancelled" });
						return;
					}
					resolve({
						kind: "errored",
						message: stderr.trim() || (err as Error).message,
					});
					return;
				}
				resolve({ kind: "picked", path: stdout.trim() });
			},
		);
	});
}

async function pickByPlatform(preselect: string): Promise<PickerResult> {
	const stubFile = process.env.CONTEXT_PICKER_STUB_FILE;
	const stub = stubFile ? readFileSync(stubFile, "utf-8").trim() : process.env.CONTEXT_PICKER_STUB;
	if (stub === "__cancel__") return { kind: "cancelled" };
	if (stub === "__unavailable__") return { kind: "unavailable" };
	if (stub === "__error__") return { kind: "errored", message: "Stubbed picker error" };
	if (stub) return { kind: "picked", path: stub };
	if (process.platform === "darwin") {
		return runMacPicker(preselect);
	}
	if (process.platform === "win32") {
		const encoded = Buffer.from(
			buildWindowsPickerScript(preselect),
			"utf16le",
		).toString("base64");
		const first = await runWindowsPicker("pwsh", encoded);
		if (first.kind !== "unavailable") return first;
		return runWindowsPicker("powershell", encoded);
	}
	const zen = await runZenity(preselect);
	if (zen.kind !== "unavailable") return zen;
	return runKdialog(preselect);
}

export const GET = withService(async ({ request }) => {
	const preselect = new URL(request.url).searchParams.get("path") ?? "";
	const result = await pickByPlatform(preselect);
	if (result.kind === "picked") return Response.json({ path: result.path });
	if (result.kind === "cancelled") return new Response(null, { status: 204 });
	if (result.kind === "errored") {
		return Response.json({ error: result.message }, { status: 500 });
	}
	return Response.json(
		{
			error: `No directory picker is available on ${process.platform}. ` +
				"Install zenity or kdialog (Linux), or paste the path manually.",
		},
		{ status: 501 },
	);
});
