/**
 * Local console rules storage service.
 *
 * These are CLIENT-SIDE only rules, distinct from the server-side Graph
 * Inbox Rules (see services/graph/rules.ts). They are evaluated locally
 * against polled mail in the checkNewMessages loop.
 *
 * Per-account key: "local_console_rules_{sanitized_email}"
 * Default key:     "local_console_rules"
 *
 * See original functions at lines 11213–11245.
 */
import type { LocalConsoleRule } from '../../types';
import { getAccountScopedKey, ACCOUNT_KEY_PREFIXES, STORAGE_KEYS } from '../../utils/storage-keys';

function getRulesKey(email?: string | null): string {
  if (!email) return STORAGE_KEYS.LOCAL_CONSOLE_RULES;
  return getAccountScopedKey(ACCOUNT_KEY_PREFIXES.LOCAL_CONSOLE_RULES, email);
}

export function loadLocalConsoleRules(email?: string | null): LocalConsoleRule[] {
  try {
    const key = getRulesKey(email);
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

export function saveLocalConsoleRules(rules: LocalConsoleRule[], email?: string | null): void {
  const key = getRulesKey(email);
  localStorage.setItem(key, JSON.stringify(rules));
}
