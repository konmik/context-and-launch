import type { DirectoryPickerResult } from "~/core/infra/native-file-dialog.js";
import { pickDirectory as pickDirectoryOnServer } from "./shared-api.js";

export function pickDirectory(preselect: string): Promise<DirectoryPickerResult> {
	const desktopPicker = globalThis.window?.contextLaunch?.pickDirectory;
	return desktopPicker
		? desktopPicker(preselect)
		: pickDirectoryOnServer(preselect);
}
