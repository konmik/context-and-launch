import {
  canonicalPath,
  readActiveMarker,
  tokenEnvironmentName,
  workspaceEnvironmentName,
} from "./test-workspace.mjs";

const workspace = process.env[workspaceEnvironmentName];
const token = process.env[tokenEnvironmentName];
let valid = false;
try {
  const marker = workspace ? readActiveMarker(workspace) : undefined;
  valid = Boolean(
    marker
    && token
    && token === marker.token
    && canonicalPath(workspace) === canonicalPath(process.cwd()),
  );
} catch {
  valid = false;
}
if (!valid) {
  console.error(
    "Internal workspace test commands require a managed isolated workspace. "
    + "Run the public pnpm test command instead.",
  );
  process.exit(1);
}
