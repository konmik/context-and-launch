/**
 * Marker/config key used for a project-level agent launched without a task.
 * Contains characters that are never valid in a task folder name or a board
 * status slug, so it can never collide with a real task's agent marker or
 * column defaults. Kept in a pure module so both server launch code and the
 * client launcher UI can import it without pulling in node-only dependencies.
 */
export const PROJECT_LAUNCH_KEY = '__project__'
