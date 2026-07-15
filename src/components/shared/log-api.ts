import { readAppLogs, clearAppLogs } from "~/core/infra/app-logger.js";

export async function getAppLogs(): Promise<string> {
	"use server";
	return readAppLogs();
}

export async function serverClearAppLogs(): Promise<void> {
	"use server";
	clearAppLogs();
}
