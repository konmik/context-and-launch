import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { appLog } from './app-logger.js';

export function openFileDialog(startDir?: string): Promise<string[]> {
	const stubFile = process.env.CONTEXT_FILE_PICKER_STUB_FILE;
	const stub = stubFile ? readFileSync(stubFile, "utf-8").trim() : process.env.CONTEXT_FILE_PICKER_STUB;
	if (stub === "__cancel__") return Promise.resolve([]);
	if (stub === "__error__") return Promise.reject(new Error("Stubbed file picker error"));
	if (stub) return Promise.resolve(stub.split("\n").filter(Boolean));
	return new Promise((resolve, reject) => {
		const platform = process.platform;

		if (platform === 'win32') {
			const initialDir = startDir
				? `$d.InitialDirectory = '${startDir.replace(/'/g, "''")}'\n`
				: "";
			const script = `
Add-Type -AssemblyName PresentationFramework
$p = @{ Width=0; Height=0; WindowStyle='None'
  ShowInTaskbar=$false; Topmost=$true }
$h = New-Object System.Windows.Window -Property $p
$h.Show()
$d = New-Object Microsoft.Win32.OpenFileDialog
$d.Multiselect = $true
$d.Title = 'Select files for reference'
${initialDir}$r = $d.ShowDialog($h)
$h.Close()
if ($r) { $d.FileNames -join [char]10 }
`;
			appLog('exec', 'powershell OpenFileDialog');
			execFile('powershell', ['-STA', '-NoProfile', '-Command', script], (err, stdout) => {
				if (err) return reject(err);
				resolve(parseOutput(stdout));
			});
		} else if (platform === 'darwin') {
			const escaped = startDir
				? startDir.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
				: "";
			const defaultLoc = escaped ? ` default location POSIX file "${escaped}"` : "";
			const script = [
				`set theFiles to choose file with multiple selections allowed${defaultLoc}`,
				'set output to ""',
				'repeat with f in theFiles',
				'set output to output & POSIX path of f & linefeed',
				'end repeat',
				'return output',
			].join('\n');
			appLog('exec', 'osascript OpenFileDialog');
			execFile('osascript', ['-e', script], (err, stdout) => {
				if (err) {
					if (err.code === 1) return resolve([]);
					return reject(err);
				}
				resolve(parseOutput(stdout));
			});
		} else {
			appLog('exec', 'zenity OpenFileDialog');
			const args = ['--file-selection', '--multiple', '--separator=\n'];
			if (startDir) args.push(`--filename=${startDir.replace(/\/?$/, "/")}`);
			execFile('zenity', args, (err, stdout) => {
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
