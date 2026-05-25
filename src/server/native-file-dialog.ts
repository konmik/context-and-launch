import { execFile } from 'child_process';

export function openFileDialog(): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const platform = process.platform;

		if (platform === 'win32') {
			const script = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Multiselect = $true
$d.Title = 'Select files for reference'
if ($d.ShowDialog() -eq 'OK') { $d.FileNames -join [char]10 }
`;
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
			execFile('osascript', ['-e', script], (err, stdout) => {
				if (err) {
					if (err.code === 1) return resolve([]);
					return reject(err);
				}
				resolve(parseOutput(stdout));
			});
		} else {
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
