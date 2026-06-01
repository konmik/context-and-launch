import type { BoardDefinition } from "~/server/project/board-config.js";

export interface BoardRef {
  id: string;
  name: string;
}

export async function fetchBoards(): Promise<BoardDefinition[]> {
  const res = await fetch("/api/boards");
  if (!res.ok) throw new Error(`Failed to load boards (${res.status})`);
  return res.json();
}
