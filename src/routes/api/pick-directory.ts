import { execFile } from "child_process";
import { withService } from "~/server/shared/route-helpers.js";

function runPicker(exe: string, encoded: string): Promise<{ ran: boolean; path?: string }> {
	return new Promise((resolve) => {
		execFile(
			exe,
			["-NoProfile", "-EncodedCommand", encoded],
			{ timeout: 60000 },
			(err, stdout) => {
				if (err) {
					resolve({ ran: (err as NodeJS.ErrnoException).code !== "ENOENT" });
					return;
				}
				resolve({ ran: true, path: stdout.trim() });
			}
		);
	});
}

function buildPickerScript(preselect: string): string {
	const selectedPath = preselect
		? `$d.SelectedPath = '${preselect.replace(/'/g, "''")}'\n`
		: "";
	return `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Select directory'
$d.ShowNewFolderButton = $true
${selectedPath}if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath } else { exit 1 }
`;
}

export const GET = withService(async ({ request }) => {
	const preselect = new URL(request.url).searchParams.get("path") ?? "";
	const encoded = Buffer.from(buildPickerScript(preselect), "utf16le").toString("base64");
	let result = await runPicker("pwsh", encoded);
	if (!result.ran) result = await runPicker("powershell", encoded);
	if (result.path) return Response.json({ path: result.path });
	return new Response("No directory selected", { status: 204 });
});
