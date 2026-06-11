## Problem Statement

There are ~46 API route files under src/routes/api/. Most hand-roll request.json() parsing and field-by-field typeof assertions, repeating the same error-handling shape. Request bodies on the client side are typed as Record<string, unknown> -- API contracts are implicit and can only be inferred by reading route code. Domain types (TicketInfo, BoardState, MergedLauncherConfig) are shared between client and server, but request/response types are not.

## Solution

Add Valibot v1 as a runtime validation library. Define shared request schemas co-located with existing domain types. Build a validated() wrapper that composes with the existing route context wrappers (withService, withProject, withTicketStore) to parse and validate request bodies. Migrate routes to use the wrapper. Type client call sites with the shared request types.

## User Stories

1. As a developer, I want request body shapes defined once in a schema, so that the type and runtime check are a single source of truth.
2. As a developer, I want a validated() wrapper that composes with existing route wrappers, so that I can add body validation without rewriting route context injection.
3. As a developer, I want invalid request bodies to produce clear ValidationError responses, so that callers see what field was wrong.
4. As a developer, I want client-side fetch calls typed with the shared request types, so that the compiler catches contract mismatches.
5. As a developer, I want request schemas co-located with domain types, so that I can find the request shape next to the domain it describes.
6. As a developer, I want route files reduced to handler logic only, so that validation boilerplate does not obscure intent.
7. As a developer, I want routes that do not accept a body (GET, DELETE with no body) to remain unchanged, so that the migration does not touch code that has no validation to centralize.

## Implementation Decisions

Validation library: Valibot v1. Chosen over Zod v4 Mini, ArkType, and manual validation. Valibot has the smallest tree-shaken bundle (1.4 KB), native SolidJS ecosystem fit, and a functional pipe-based API. Zod Mini uses a different API dialect from regular Zod while still being 3-5x larger. This project does not use tRPC or Drizzle, so Zod's ecosystem advantage does not apply.

Schema location: co-located with existing domain types in the same file. Ticket request schemas go in ticket-store.ts alongside TicketInfo. Board request schemas go in board-types.ts alongside BoardState. Launcher schemas go in launcher-config.ts alongside MergedLauncherConfig. The client already uses import type from src/server/, so no new import paths are needed. This follows vertical/feature slicing -- schemas live with the domain they describe.

Route factory design: a validated() wrapper function in route-helpers.ts. It takes a valibot schema and a handler function. It calls request.json(), runs valibot parse, and either passes the typed body to the handler or throws a ValidationError. It composes with the existing context wrappers rather than replacing them:

```typescript
export const PUT = withTicketStore(validated(UpdateTicketRequest, async (ctx, body) => {
  ctx.store.updateTicket(ctx.folderName, body.number, body.title, body.status);
  return new Response(null, { status: 204 });
}));
```

The existing wrappers (withService, withProject, withTicketStore) continue to handle context injection, param extraction, and error wrapping. validated() handles body parsing only. These are orthogonal concerns.

Existing itemRoutes() for launcher-config: keep as-is or fold into the new factory, to be decided during implementation based on which approach produces less code.

Migration order: start with the highest-duplication groups (tickets, boards/columns), then remaining routes.

Client-side changes: replace Record<string, unknown> casts and manual field checks with the shared valibot-inferred types. Client code uses import type to keep server code out of the client bundle.

Routes that do not parse a request body (GET handlers, DELETE with no body) are not migrated -- the wrapper only applies where body validation exists.

## Testing Decisions

No new tests. Valibot schemas are runtime validation -- the validation itself is the test. The existing e2e tests exercise routes end-to-end against a real server, which covers the validated() wrapper in integration.

## Out of Scope

Response type schemas: this ticket covers request validation only. Response types remain as TypeScript interfaces (TicketInfo, BoardState) without runtime validation.

FormData routes: file upload routes (tickets/files/upload) use FormData, not JSON. They are excluded from the validated() wrapper.

New API endpoints: no new routes are added. This is a refactor of existing routes.

Error response format changes: the existing error response shape ({ error: string } or plain text) is preserved.

## Further Notes

Valibot schemas export both the schema object (for runtime use in routes) and the inferred type (for compile-time use in client code). Example: the schema CreateTicketRequest is used by the route, and type CreateTicketRequest = v.InferOutput<typeof CreateTicketRequest> is used by client fetch calls.
