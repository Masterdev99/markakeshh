/**
 * Per-account identity storage service.
 *
 * Manages from_alias, reply_to, send_email, send_display_name per account.
 *
 * KEY FORMAT: {prefix}_{sanitized_email} where non-alphanumeric chars → "_"
 * This exact pattern MUST be preserved for backward compatibility.
 * See original functions at lines 11017–11212.
 */
import { getAccountScopedKey, ACCOUNT_KEY_PREFIXES } from '../../utils/storage-keys';

// ==================== FROM ALIAS ====================

export function getFromAliasKey(email: string): string {
  return getAccountScopedKey(ACCOUNT_KEY_PREFIXES.FROM_ALIAS, email);
}

export function getFromAlias(email: string): string {
  return localStorage.getItem(getFromAliasKey(email)) || '';
}

export function setFromAlias(email: string, alias: string): void {
  localStorage.setItem(getFromAliasKey(email), alias);
}

export function clearFromAlias(email: string): void {
  localStorage.removeItem(getFromAliasKey(email));
}

// ==================== REPLY-TO ====================

export function getReplyToKey(email: string): string {
  return getAccountScopedKey(ACCOUNT_KEY_PREFIXES.REPLY_TO, email);
}

export function getReplyTo(email: string): string {
  return localStorage.getItem(getReplyToKey(email)) || '';
}

export function setReplyTo(email: string, replyTo: string): void {
  localStorage.setItem(getReplyToKey(email), replyTo);
}

export function clearReplyTo(email: string): void {
  localStorage.removeItem(getReplyToKey(email));
}

// ==================== SEND-AS EMAIL ====================

export function getSendEmailKey(email: string): string {
  return getAccountScopedKey(ACCOUNT_KEY_PREFIXES.SEND_EMAIL, email);
}

export function getSendEmail(email: string): string {
  return localStorage.getItem(getSendEmailKey(email)) || '';
}

export function setSendEmail(email: string, sendEmail: string): void {
  localStorage.setItem(getSendEmailKey(email), sendEmail);
}

// ==================== SEND-AS DISPLAY NAME ====================

export function getSendDisplayNameKey(email: string): string {
  return getAccountScopedKey(ACCOUNT_KEY_PREFIXES.SEND_DISPLAY_NAME, email);
}

export function getSendDisplayName(email: string): string {
  return localStorage.getItem(getSendDisplayNameKey(email)) || '';
}

export function setSendDisplayName(email: string, name: string): void {
  localStorage.setItem(getSendDisplayNameKey(email), name);
}
