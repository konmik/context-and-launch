/**
 * Strips batch metacharacters from a string so it can be safely
 * interpolated into a .bat file (e.g. the `title` command).
 *
 * Characters removed: & | > < ^ % " \r \n
 */
export function escapeBatchTitle(s: string): string {
  return s.replace(/[&|><^%"\r\n]/g, "");
}
