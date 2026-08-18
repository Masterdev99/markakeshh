/**
 * Mail live-sync interval — how often the app polls for new messages
 * (useLiveSync). Separate from the feed/auto-import interval in
 * services/storage/feed.ts, which controls how often accounts are
 * re-imported from an external feed URL, not how often mail is checked.
 */
import { STORAGE_KEYS } from '../../utils/storage-keys';

export const DEFAULT_MAIL_SYNC_INTERVAL_SECONDS = 30;

export function getMailSyncIntervalSeconds(): number {
  const raw = localStorage.getItem(STORAGE_KEYS.MAIL_SYNC_INTERVAL);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAIL_SYNC_INTERVAL_SECONDS;
}

export function setMailSyncIntervalSeconds(seconds: number): void {
  localStorage.setItem(STORAGE_KEYS.MAIL_SYNC_INTERVAL, String(seconds));
  window.dispatchEvent(new Event('outlook:mail-sync-interval-changed'));
}
