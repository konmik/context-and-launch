import path from "path";

const MIME_TYPES: Record<string, string> = {
	".txt": "text/plain",
	".md": "text/plain",
	".json": "application/json",
	".csv": "text/csv",
	".xml": "text/xml",
	".html": "text/html",
	".css": "text/css",
	".js": "text/javascript",
	".ts": "text/plain",
	".tsx": "text/plain",
	".jsx": "text/plain",
	".yaml": "text/plain",
	".yml": "text/plain",
	".toml": "text/plain",
	".ini": "text/plain",
	".cfg": "text/plain",
	".conf": "text/plain",
	".log": "text/plain",
	".sh": "text/plain",
	".bat": "text/plain",
	".ps1": "text/plain",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".pdf": "application/pdf",
};

/** Returns the MIME type for a file name, or `null` if the extension is not recognized. */
export function getMimeType(fileName: string): string | null {
	const ext = path.extname(fileName).toLowerCase();
	return MIME_TYPES[ext] ?? null;
}
