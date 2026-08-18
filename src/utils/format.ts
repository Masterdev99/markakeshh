/**
 * Date and file formatting utilities — ported from lines 13215–13265.
 */

/**
 * Compact date format for message list:
 * - Today → time (e.g. "3:45 PM")
 * - This week → weekday (e.g. "Mon")
 * - Older → month + day (e.g. "Aug 5")
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  if (diff < 86_400_000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diff < 604_800_000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

/**
 * Full date format for reading pane header.
 */
export function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Human-readable file size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Get file extension from a filename.
 */
export function getFileExtension(name: string): string {
  return (name || '').split('.').pop() || '';
}

/**
 * Returns a CSS class name for file icon display.
 */
export function getFileIconClass(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (['doc', 'docx', 'rtf', 'txt'].includes(e)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'xls';
  if (['ppt', 'pptx'].includes(e)) return 'ppt';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'zip';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'img';
  return 'other';
}

/**
 * Message grouping labels for the mail list.
 * High importance messages → "Pinned", others grouped by date.
 */
export function getMessageGroup(dateStr: string, importance?: string): string {
  if (importance === 'high') return 'Pinned';

  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const lastWeek = new Date(startOfWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(thisMonth);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= startOfWeek) return 'This week';
  if (d >= lastWeek) return 'Last week';
  if (d >= thisMonth) return 'This month';
  if (d >= lastMonth) return 'Last month';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: 'long' });
  }
  return d.getFullYear().toString();
}

/**
 * Convert a base64 string to a Blob for attachment downloads.
 */
export function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: contentType });
}
