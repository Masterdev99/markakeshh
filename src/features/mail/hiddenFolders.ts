/** Exchange's technical folders — hidden from the sidebar and the move picker unless "Show hidden folders" is on. */
export const HIDDEN_FOLDER_NAMES = new Set([
  'conversation history', 'sync issues', 'conflicts', 'local failures', 'server failures',
]);

export function isHiddenFolder(displayName: string): boolean {
  return HIDDEN_FOLDER_NAMES.has(displayName.toLowerCase());
}
