import type { APIEvent } from "@solidjs/start/server";
import { worktreeManager } from "~/server/config/instances.js";
import { TicketStore } from "~/server/ticket/ticket-store.js";
import { AppError, PayloadError, errorMessage } from "~/server/shared/errors.js";

function errorResponse(e: unknown, defaultStatus: number): Response {
  if (e instanceof PayloadError) {
    return Response.json(e.payload, { status: e.statusCode });
  }
  const status = e instanceof AppError ? e.statusCode : defaultStatus;
  return Response.json({ error: errorMessage(e) }, { status });
}

export function withService(
  handler: (event: APIEvent) => Promise<Response>,
  defaultStatus = 500,
): (event: APIEvent) => Promise<Response> {
  return async (event: APIEvent) => {
    try {
      return await handler(event);
    } catch (e) {
      return errorResponse(e, defaultStatus);
    }
  };
}

export interface ProjectContext {
  projectSlug: string;
  worktreeDir: string;
  params: Record<string, string>;
}

export interface TicketContext extends ProjectContext {
  store: TicketStore;
  folderName: string;
}

export function withProject(
  handler: (ctx: ProjectContext, request: Request) => Promise<Response>,
  errorStatus = 500,
): (event: APIEvent) => Promise<Response> {
  return async ({ params, request }: APIEvent) => {
    try {
      const projectSlug = params.projectSlug;
      const worktreeDir = worktreeManager.getWorktreeDir(projectSlug);
      return await handler({ projectSlug, worktreeDir, params }, request);
    } catch (e) {
      return errorResponse(e, errorStatus);
    }
  };
}

export function withTicketStore(
  handler: (ctx: TicketContext, request: Request) => Promise<Response>,
  errorStatus = 400,
): (event: APIEvent) => Promise<Response> {
  return withProject(async (ctx, request) => {
    const store = new TicketStore(ctx.worktreeDir);
    return await handler(
      { ...ctx, store, folderName: ctx.params.folderName },
      request,
    );
  }, errorStatus);
}
