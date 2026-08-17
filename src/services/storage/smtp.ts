/**
 * SMTP / Telegram notification settings storage.
 *
 * NOTE: Despite the name "smtp_settings", this stores Telegram bot credentials:
 *   host → bot token
 *   user → chat ID
 *
 * The misleading field names are preserved intentionally for backward
 * compatibility with existing users' saved settings.
 * See original functions at lines 12356–12428.
 */
import type { SmtpSettings } from '../../types';
import { STORAGE_KEYS } from '../../utils/storage-keys';

export function loadSmtpSettings(): SmtpSettings {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.SMTP_SETTINGS) || '{}');
  } catch {
    return { host: '', user: '' };
  }
}

export function saveSmtpSettings(settings: SmtpSettings): void {
  localStorage.setItem(STORAGE_KEYS.SMTP_SETTINGS, JSON.stringify(settings));
}

export function getRefreshProxyUrl(): string | null {
  return (localStorage.getItem(STORAGE_KEYS.REFRESH_PROXY_URL) || '').trim() || null;
}

export function saveRefreshProxyUrl(url: string): void {
  localStorage.setItem(STORAGE_KEYS.REFRESH_PROXY_URL, url);
}

// ── Friendly Telegram-named accessors ────────────────────────────────────────
// Maps to the exact same `smtp_settings` key so existing data is never lost.

export interface TelegramSettings {
  botToken: string;
  chatId: string;
}

export function getTelegramSettings(): TelegramSettings {
  const s = loadSmtpSettings();
  return { botToken: s.host || '', chatId: s.user || '' };
}

export function saveTelegramSettings(t: TelegramSettings): void {
  saveSmtpSettings({ host: t.botToken, user: t.chatId });
}

/** Sends a rule-matched message notification to Telegram using the globally configured bot/chat. */
export async function telegramNotifyMessage(text: string): Promise<void> {
  const { botToken, chatId } = getTelegramSettings();
  if (!botToken || !chatId) {
    throw new Error('Telegram not configured. Go to Rules → Telegram Settings.');
  }
  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.description || 'Telegram sendMessage failed');
}
