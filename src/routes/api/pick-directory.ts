import { execFile } from "child_process";
import { withService } from "~/server/shared/route-helpers.js";
import { normalizeMacPickedPath } from "~/server/infra/picker-paths.js";

interface PickerResult {
	available: boolean;
	path?: string;
}

function runWindowsPicker(exe: string, encoded: string): Promise<PickerResult> {
	return new Promise((resolve) => {
		execFile(
			exe,
			["-STA", "-NoProfile", "-EncodedCommand", encoded],
			{ timeout: 600000 },
			(err, stdout) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						resolve({ available: false });
						return;
					}
					resolve({ available: true });
					return;
				}
				resolve({ available: true, path: stdout.trim() });
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
			(err, stdout) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						resolve({ available: false });
						return;
					}
					resolve({ available: true });
					return;
				}
				resolve({ available: true, path: normalizeMacPickedPath(stdout) });
			},
		);
	});
}

function runZenity(preselect: string): Promise<PickerResult> {
	const args = ["--file-selection", "--directory", "--title=Select directory"];
	if (preselect) args.push(`--filename=${preselect.replace(/\/?$/, "/")}`);
	return new Promise((resolve) => {
		execFile("zenity", args, { timeout: 600000 }, (err, stdout) => {
			if (err) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT") {
					resolve({ available: false });
					return;
				}
				resolve({ available: true });
				return;
			}
			resolve({ available: true, path: stdout.trim() });
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
			(err, stdout) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === "ENOENT") {
						resolve({ available: false });
						return;
					}
					resolve({ available: true });
					return;
				}
				resolve({ available: true, path: stdout.trim() });
			},
		);
	});
}

async function pickByPlatform(preselect: string): Promise<PickerResult> {
	const stub = process.env.CONTEXT_PICKER_STUB;
	if (stub) return { available: true, path: stub };
	if (process.platform === "darwin") {
		return runMacPicker(preselect);
	}
	if (process.platform === "win32") {
		const encoded = Buffer.from(
			buildWindowsPickerScript(preselect),
			"utf16le",
		).toString("base64");
		const first = await runWindowsPicker("pwsh", encoded);
		if (first.available) return first;
		return runWindowsPicker("powershell", encoded);
	}
	const zen = await runZenity(preselect);
	if (zen.available) return zen;
	return runKdialog(preselect);
}

export const GET = withService(async ({ request }) => {
	const preselect = new URL(request.url).searchParams.get("path") ?? "";
	const result = await pickByPlatform(preselect);
	if (result.path) return Response.json({ path: result.path });
	if (result.available) {
		return new Response(null, { status: 204 });
	}
	return Response.json(
		{
			error: `No directory picker is available on ${process.platform}. ` +
				"Install zenity or kdialog (Linux), or paste the path manually.",
		},
		{ status: 501 },
	);
});
