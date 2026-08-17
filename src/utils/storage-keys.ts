/**
 * Account-scoped localStorage key utility.
 *
 * The original app stores per-account settings with a key pattern of
 * `{prefix}_{sanitized_email}` where non-alphanumeric chars → "_".
 * A `*_default` fallback is used when no account email is available.
 *
 * This exact pattern MUST be preserved for backward compatibility with
 * existing users' saved data.
 */
export function getAccountScopedKey(prefix: string, email?: string | null): string {
  if (!email) return `${prefix}_default`;
  // Replace all non-alphanumeric characters with underscores (matches original)
  const sanitized = email.replace(/[^a-z0-9]/gi, '_');
  return `${prefix}_${sanitized}`;
}

/**
 * Static storage keys used by the app.
 * All keys must be preserved exactly for backward compatibility.
 */
export const STORAGE_KEYS = {
  ACCOUNTS: 'outlook_accounts',
  EMAIL_SIGNATURES: 'email_signatures',
  FEED_URL: 'feed_url',
  FEED_INTERVAL: 'feed_interval',
  REFRESH_PROXY_URL: 'refresh_proxy_url',
  SMTP_SETTINGS: 'smtp_settings',
  LOCAL_CONSOLE_RULES: 'local_console_rules', // default/no-account fallback
} as const;

/**
 * Per-account key prefixes.
 * Use with getAccountScopedKey(prefix, email).
 */
export const ACCOUNT_KEY_PREFIXES = {
  FROM_ALIAS: 'from_alias',
  REPLY_TO: 'reply_to',
  SEND_EMAIL: 'send_email',
  SEND_DISPLAY_NAME: 'send_display_name',
  LOCAL_CONSOLE_RULES: 'local_console_rules',
} as const;

/** Old key that was migrated to ACCOUNTS. Used for one-time migration on first load. */
export const LEGACY_ACCOUNTS_KEY = 'm365_accounts';
