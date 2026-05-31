import { execFile } from 'child_process';
import { readFileSync } from 'fs';

export function openFileDialog(): Promise<string[]> {
	const stubFile = process.env.CONTEXT_FILE_PICKER_STUB_FILE;
	const stub = stubFile ? readFileSync(stubFile, "utf-8").trim() : process.env.CONTEXT_FILE_PICKER_STUB;
	if (stub === "__cancel__") return Promise.resolve([]);
	if (stub === "__error__") return Promise.reject(new Error("Stubbed file picker error"));
	if (stub) return Promise.resolve(stub.split("\n").filter(Boolean));
	return new Promise((resolve, reject) => {
		const platform = process.platform;

		if (platform === 'win32') {
			const script = `
Add-Type -AssemblyName PresentationFramework
$d = New-Object Microsoft.Win32.OpenFileDialog
$d.Multiselect = $true
$d.Title = 'Select files for reference'
if ($d.ShowDialog()) { $d.FileNames -join [char]10 }
`;
			console.log('[exec] powershell OpenFileDialog');
			execFile('powershell', ['-STA', '-NoProfile', '-Command', script], (err, stdout) => {
				if (err) return reject(err);
				resolve(parseOutput(stdout));
			});
		} else if (platform === 'darwin') {
			const script = [
				'set theFiles to choose file with multiple selections allowed',
				'set output to ""',
				'repeat with f in theFiles',
				'set output to output & POSIX path of f & linefeed',
				'end repeat',
				'return output',
			].join('\n');
			console.log('[exec] osascript OpenFileDialog');
			execFile('osascript', ['-e', script], (err, stdout) => {
				if (err) {
					if (err.code === 1) return resolve([]);
					return reject(err);
				}
				resolve(parseOutput(stdout));
			});
		} else {
			console.log('[exec] zenity OpenFileDialog');
			execFile('zenity', ['--file-selection', '--multiple', '--separator=\n'], (err, stdout) => {
				if (err) {
					if (err.code === 1) return resolve([]);
					return reject(err);
				}
				resolve(parseOutput(stdout));
			});
		}
	});
}

function parseOutput(stdout: string): string[] {
	return stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
}
