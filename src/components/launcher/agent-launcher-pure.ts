import type { ErrorInfo } from "~/server/shared/errors.js";

export function textToErrorInfo(text: string, status: number): ErrorInfo {
	try {
		const data = JSON.parse(text);
		if (data.description) return data as ErrorInfo;
		if (data.error) return { description: data.error };
		return { description: JSON.stringify(data) };
	} catch {
		return { description: text || `Error ${status}` };
	}
}
