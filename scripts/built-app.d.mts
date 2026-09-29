import type { IncomingMessage, ServerResponse } from 'node:http'

export interface FetchHandler {
  fetch(request: Request): Promise<Response>
}

export function createBuiltAppHandler(serverHandler: FetchHandler, clientRoot: string): (request: Request) => Promise<Response>
export function createNodeRequestHandler(
  handleRequest: (request: Request) => Promise<Response>,
): (request: IncomingMessage, response: ServerResponse) => Promise<void>
