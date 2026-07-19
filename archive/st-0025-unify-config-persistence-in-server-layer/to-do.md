# Unify config persistence in server layer

## Problem

Three server modules independently reimplement the same JSON persistence lifecycle: read from disk, parse, validate, cache, write back.

- src/server/launcher/launcher-config.ts (~599 lines): reads files directly via paths.readConfigFile, no validation in parseConfig, no caching. Also contains ~75 lines of Map-based merge logic in getMergedConfig tangled with file IO.
- src/server/project/project-registry.ts (~364 lines): uses ConfigRepository, caches the whole config in memory, has load-time schema checks and manual legacy-field migration.
- src/server/ticket/ticket-store.ts (~400 lines): reads from disk on every call, validates paths and folder names inline.

ConfigRepository (src/server/config/config-repository.ts, 26 lines) exists but only project-registry uses it, so there are two competing IO patterns. Caching strategy differs per module by accident, not by design.

## Goal

Extract one schema-validated, consistently-cached JSON store abstraction. The three modules become pure domain logic on top of it.

## To do

- Design the store abstraction: readJson/writeJson with schema validation, consistent caching policy, error context (which file, what failed). Missing required values throw -- no silent fallback defaults.
- Move launcher-config file IO onto the abstraction; lift getMergedConfig merge logic out of IO into a pure function.
- Move project-registry onto it; keep legacy migration as an explicit, tested step.
- Move ticket-store status.json read/write onto it (folder/path validation stays in ticket-store).
- Unit-test the abstraction; existing module tests keep passing.
