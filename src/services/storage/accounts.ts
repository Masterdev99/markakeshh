/**
 * Accounts storage service.
 *
 * Single persistence point for the accounts array.
 * localStorage key: "outlook_accounts"  ← must not be renamed
 *
 * Also handles the one-time migration from the legacy "m365_accounts" key.
 */
import type { Account } from '../../types';
import { STORAGE_KEYS, LEGACY_ACCOUNTS_KEY } from '../../utils/storage-keys';

/**
 * Run once on app startup — migrates from old key if needed.
 * Mirrors the IIFE at lines 7607–7617 of the original.
 */
export function migrateAccountsKey(): void {
  if (!localStorage.getItem(STORAGE_KEYS.ACCOUNTS)) {
    const oldData = localStorage.getItem(LEGACY_ACCOUNTS_KEY);
    if (oldData) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, oldData);
      console.log(`Migrated accounts from "${LEGACY_ACCOUNTS_KEY}" to "${STORAGE_KEYS.ACCOUNTS}"`);
    }
  }
}

export function loadAccounts(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNTS) || '[]');
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]): void {
  localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
}
