import { execFile } from "child_process";
import type { APIEvent } from "@solidjs/start/server";

export async function GET({ request }: APIEvent) {
	const preselect = new URL(request.url).searchParams.get("path") ?? "";
	const selectedPath = preselect
		? `$d.SelectedPath = '${preselect.replace(/'/g, "''")}'\n`
		: "";
	const script = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Select directory'
$d.ShowNewFolderButton = $true
${selectedPath}if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath } else { exit 1 }
`;
	const encoded = Buffer.from(script, "utf16le").toString("base64");

	try {
		const selected = await new Promise<string>((resolve, reject) => {
			execFile(
				"powershell",
				["-NoProfile", "-EncodedCommand", encoded],
				{ timeout: 60000 },
				(err, stdout) => {
					if (err) reject(err);
					else resolve(stdout.trim());
				}
			);
		});
		return Response.json({ path: selected });
	} catch {
		return new Response("No directory selected", { status: 204 });
	}
}
