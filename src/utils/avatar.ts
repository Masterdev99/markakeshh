/**
 * Avatar utilities — faithful port from lines 13189–13213.
 */

export function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
