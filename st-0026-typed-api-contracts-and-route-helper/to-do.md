# Typed API contracts and route helper

## Problem

There are ~47 API route files under src/routes/api/. Most hand-roll request.json() parsing and field-by-field type assertions, and each repeats the same error-handling shape. The launcher-config routes already prove the fix: itemRoutes() collapses them to 3-line files, but nothing equivalent exists for the rest (boards, columns, tickets, context files).

On the client side, request bodies are typed as Record<string, unknown> (e.g. ticket update in ticket-detail-state.ts). API contracts are implicit: PUT/POST body shapes can only be inferred by reading route code. Domain types (TicketInfo, BoardState, MergedLauncherConfig) are shared, but request/response types are not.

## Goal

Shared request/response types per endpoint plus a generic validated-body route factory. Fixes server boilerplate and the missing client/server contract in one move.

## To do

- Define shared request types per endpoint (e.g. UpdateTicketRequest, CreateBoardRequest, SaveContextRequest) in a location importable by both client and server.
- Build a route factory that parses the body, validates it against the expected shape, and returns a typed value; invalid input produces a clear error response, never a silent default.
- Migrate routes to the factory, starting with the highest-duplication groups (tickets, boards/columns).
- Type the client call sites with the shared request types (replaces Record<string, unknown>).
- Keep the existing itemRoutes() launcher-config helper or fold it into the new factory.
