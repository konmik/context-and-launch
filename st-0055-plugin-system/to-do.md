I want to create a plugin and deep module system.

The example of plugin system is at C:\third-party\deepseek-harness.

I also want to reduce the surface of components to explicit interfaces, to facilitate deep modules architecture.

Requirements for plugins:
- It must be possible to disable them per project

Requirements for deep modules:
- Barrel exports (index.ts per feature folder) are the primary way to define a module's public API. For enforcement: eslint-plugin-boundaries for convention-level, package.json exports field for hard boundaries (requires monorepo with real packages).
- If there is a better fitting for the current project system than barrel exports, then use it instead

Requirements for source code structure:
- Use separation by feature, not by code type
