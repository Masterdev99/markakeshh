/**
 * Avatar utilities — faithful port from lines 13189–13213.
 */

export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  // Some display names lead with a symbol, emoji, or digit (e.g. "*John Doe",
  // "007 Ops") — find each part's first actual letter rather than blindly
  // taking its first character, so those don't end up as the avatar initial.
  const letters = parts
    .map((p) => p.match(/\p{L}/u)?.[0])
    .filter((c): c is string => !!c);
  if (letters.length === 0) return '?';
  if (letters.length === 1) return letters[0].toUpperCase();
  return (letters[0] + letters[letters.length - 1]).toUpperCase();
}

const AVATAR_COLORS = [
  '#0078d4',
  '#8764b8',
  '#e74c3c',
  '#27ae60',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#3498db',
  '#2ecc71',
];

export function getAvatarColor(str?: string | null): string {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) {
    hash = (str as string).charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
