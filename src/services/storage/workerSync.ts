/**
 * Cloudflare Worker background-sync settings storage — the URL and bearer
 * secret for the optional Worker that keeps local console rules (Telegram
 * notify, move/markAsRead/permanentDelete) running while the browser is
 * closed. Mirrors getRefreshProxyUrl()/saveRefreshProxyUrl() in ./smtp.ts.
 */
import { STORAGE_KEYS } from '../../utils/storage-keys';

export function getWorkerSyncUrl(): string | null {
  return (localStorage.getItem(STORAGE_KEYS.WORKER_SYNC_URL) || '').trim() || null;
}

export function saveWorkerSyncUrl(url: string): void {
  localStorage.setItem(STORAGE_KEYS.WORKER_SYNC_URL, url);
}

export function getWorkerSyncSecret(): string | null {
  return (localStorage.getItem(STORAGE_KEYS.WORKER_SYNC_SECRET) || '').trim() || null;
}

export function saveWorkerSyncSecret(secret: string): void {
  localStorage.setItem(STORAGE_KEYS.WORKER_SYNC_SECRET, secret);
}
