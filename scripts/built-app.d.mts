export interface FetchHandler {
  fetch(request: Request): Promise<Response>;
}

export function createBuiltAppHandler(
  serverHandler: FetchHandler,
  clientRoot: string,
): (request: Request) => Promise<Response>;
