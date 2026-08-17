/**
 * Feed / auto-import settings storage.
 * localStorage keys: "feed_url", "feed_interval"
 * See original functions at lines 7689–8000.
 */
import type { FeedSettings } from '../../types';
import { STORAGE_KEYS } from '../../utils/storage-keys';

export function loadFeedSettings(): FeedSettings | null {
  const url = localStorage.getItem(STORAGE_KEYS.FEED_URL);
  if (!url) return null;
  const interval = parseInt(localStorage.getItem(STORAGE_KEYS.FEED_INTERVAL) || '30', 10);
  return { url, interval };
}

export function saveFeedSettings(settings: FeedSettings): void {
  localStorage.setItem(STORAGE_KEYS.FEED_URL, settings.url);
  localStorage.setItem(STORAGE_KEYS.FEED_INTERVAL, String(settings.interval));
}

export function clearFeedSettings(): void {
  localStorage.removeItem(STORAGE_KEYS.FEED_URL);
}

export function getFeedUrl(): string | null {
  return localStorage.getItem(STORAGE_KEYS.FEED_URL) || null;
}

export function getFeedIntervalSeconds(): number {
  return parseInt(localStorage.getItem(STORAGE_KEYS.FEED_INTERVAL) || '30', 10);
}
