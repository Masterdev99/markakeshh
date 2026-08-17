/**
 * Export / Backup — mailbox address export, full-mailbox address export, and
 * accounts database export/import. These are plain toolbar actions in the
 * original app, not a dedicated page — see mailbox.html lines 12755–13012.
 *
 * NOTE: exportAllMessages/exportFullMailbox export the set of unique email
 * addresses seen across messages (from/to/cc), not the message content itself.
 * This is the original's actual behavior — preserved as-is, not "improved"
 * into a full content export.
 */
import { graphApi } from './graph/client';
import type { Account, Message, MessageListResponse } from '../types';

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function collectEmailAddressesFromMessages(messageList: Message[]): string[] {
  const set = new Set<string>();
  for (const m of messageList) {
    const fromAddr = m.from?.emailAddress?.address;
    if (fromAddr) set.add(fromAddr);
    for (const r of m.toRecipients || []) {
      const a = r.emailAddress?.address;
      if (a) set.add(a);
    }
    for (const r of m.ccRecipients || []) {
      const a = r.emailAddress?.address;
      if (a) set.add(a);
    }
  }
  return Array.from(set).sort();
}

/** Exports the unique email addresses seen in the currently-loaded message list for one folder. */
export function exportFolderAddresses(account: Account, folderId: string, messages: Message[]): number {
  const emailAddresses = collectEmailAddressesFromMessages(messages);
  const exportData = {
    account: { email: account.email, displayName: account.displayName, exportedAt: new Date().toISOString() },
    folder: folderId,
    totalMessages: messages.length,
    emailAddresses,
  };
  downloadJson(
    `mailbox_emails_${account.email.replace(/[^a-zA-Z0-9]/g, '_')}_${folderId}_${new Date().toISOString().split('T')[0]}.json`,
    exportData
  );
  return emailAddresses.length;
}

/** Walks every mail folder and exports the unique email addresses seen across the entire mailbox. */
export async function exportFullMailboxAddresses(
  account: Account,
  accountIdx: number,
  onProgress?: (folderName: string, count: number) => void
): Promise<{ addressCount: number; folderCount: number }> {
  const allMessages: Message[] = [];
  const foldersResp = await graphApi('/me/mailFolders?$top=100', account.accessToken, 'GET', null, 3, accountIdx) as { value: Array<{ id: string; displayName: string }> };
  const folders = foldersResp.value || [];

  for (const folder of folders) {
    let path: string | null = `/me/mailFolders/${folder.id}/messages?$top=250&$select=from,toRecipients,ccRecipients`;
    while (path) {
      const data: MessageListResponse = await graphApi(path, account.accessToken, 'GET', null, 3, accountIdx) as MessageListResponse;
      allMessages.push(...(data.value || []));
      const nextLink = data['@odata.nextLink'] || null;
      path = nextLink ? nextLink.replace('https://graph.microsoft.com/v1.0', '') : null;
      onProgress?.(folder.displayName, allMessages.length);
    }
  }

  const emailAddresses = collectEmailAddressesFromMessages(allMessages);
  const exportData = {
    account: { email: account.email, displayName: account.displayName, exportedAt: new Date().toISOString() },
    totalMessages: allMessages.length,
    foldersCount: folders.length,
    emailAddresses,
  };
  downloadJson(
    `full_mailbox_emails_${account.email.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.json`,
    exportData
  );
  return { addressCount: emailAddresses.length, folderCount: folders.length };
}

/** Exports the accounts array (tokens + metadata) as a portable .m365db backup file. */
export function exportAccountsDatabase(accounts: Account[]): void {
  const dbData = {
    version: 2,
    exportedAt: new Date().toISOString(),
    feedUrl: localStorage.getItem('feed_url') || null,
    feedInterval: localStorage.getItem('feed_interval') || '30',
    accounts: accounts.map((a) => ({
      id: a.id,
      feedId: a.feedId || null,
      email: a.email,
      displayName: a.displayName,
      accessToken: a.accessToken,
      refreshToken: a.refreshToken || null,
      label: a.label || null,
      addedAt: a.addedAt || null,
      lastFeedSync: a.lastFeedSync || null,
      autoImported: a.autoImported || false,
      unreadCount: a.unreadCount || 0,
    })),
  };
  downloadJson(`m365-accounts-${new Date().toISOString().split('T')[0]}.m365db`, dbData);
}

interface ImportedDbAccount {
  id?: string; feedId?: string | null; email?: string; displayName?: string;
  accessToken?: string; refreshToken?: string | null; label?: string | null;
  addedAt?: string; lastFeedSync?: string; autoImported?: boolean; unreadCount?: number;
}

export interface ImportDatabaseResult {
  accounts: Account[];
  imported: number;
  updated: number;
}

/** Merges a .m365db backup's accounts into the current list — updates matches by email/feedId, appends the rest. */
export function importAccountsDatabase(fileContent: string, currentAccounts: Account[]): ImportDatabaseResult {
  const dbData = JSON.parse(fileContent) as { accounts?: ImportedDbAccount[]; feedUrl?: string | null; feedInterval?: string };
  if (!dbData.accounts || !Array.isArray(dbData.accounts)) {
    throw new Error('Invalid database file — no accounts found');
  }

  const accounts = [...currentAccounts];
  let imported = 0;
  let updated = 0;

  for (const acc of dbData.accounts) {
    if (!acc.accessToken && !acc.refreshToken) continue;
    const idx = accounts.findIndex(
      (a) =>
        (a.email && acc.email && a.email.toLowerCase() === acc.email.toLowerCase()) ||
        (a.feedId && acc.feedId && a.feedId === acc.feedId)
    );
    if (idx >= 0) {
      if (acc.accessToken) accounts[idx] = { ...accounts[idx], accessToken: acc.accessToken };
      if (acc.refreshToken) accounts[idx] = { ...accounts[idx], refreshToken: acc.refreshToken };
      if (acc.displayName) accounts[idx] = { ...accounts[idx], displayName: acc.displayName };
      updated++;
    } else {
      accounts.push({
        id: acc.id || `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        feedId: acc.feedId || null,
        accessToken: acc.accessToken!,
        refreshToken: acc.refreshToken || null,
        email: acc.email || 'Unknown',
        displayName: acc.displayName || acc.email || 'Account',
        label: acc.label || null,
        addedAt: acc.addedAt || new Date().toISOString(),
        lastFeedSync: acc.lastFeedSync || undefined,
        autoImported: acc.autoImported || false,
        unreadCount: acc.unreadCount || 0,
      });
      imported++;
    }
  }

  // Restore feed settings if not already configured
  if (dbData.feedUrl && !localStorage.getItem('feed_url')) {
    localStorage.setItem('feed_url', dbData.feedUrl);
    if (dbData.feedInterval) localStorage.setItem('feed_interval', dbData.feedInterval);
  }

  return { accounts, imported, updated };
}
