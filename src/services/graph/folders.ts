/**
 * Folders Graph API service.
 *
 * Ported from lines 8926–9125.
 */

import { graphApi } from './client';
import type { MailFolder } from '../../types';

interface FolderListResponse {
  value: MailFolder[];
  '@odata.nextLink'?: string;
}

/** Follows @odata.nextLink so a folder list with more than $top items (>100 folders at one level) isn't silently truncated to its first page. */
async function fetchAllPages(url: string, token: string, accountIdx: number): Promise<MailFolder[]> {
  const all: MailFolder[] = [];
  let next: string | null = url;
  while (next) {
    const resp = await graphApi(next, token, 'GET', null, 3, accountIdx) as FolderListResponse;
    all.push(...(resp.value ?? []));
    next = resp['@odata.nextLink'] ? resp['@odata.nextLink'].replace('https://graph.microsoft.com/v1.0', '') : null;
  }
  return all;
}

// $select intentionally matches New-mailbox.html's list exactly (id,
// displayName, totalItemCount, unreadItemCount, childFolderCount) — no
// parentFolderId. That field isn't read anywhere on a MailFolder (the tree
// is built by recursing through childFolders, not by reassembling it from
// parent ids), and requesting it appears to be rejected outright by Graph
// for some mailbox types, turning every single folder request for that
// account into a hard, non-retryable 400 — no amount of retry/backoff
// resilience fixes a request that's malformed for the account in the first
// place. This is almost certainly why those specific accounts fetched fine
// in the legacy app (which never asked for this field) but never worked in
// this port.
const FOLDER_SELECT = 'id,displayName,totalItemCount,unreadItemCount,childFolderCount';

export async function fetchRootFolders(token: string, accountIdx: number): Promise<MailFolder[]> {
  return fetchAllPages(
    `/me/mailFolders?$top=100&$select=${FOLDER_SELECT}`,
    token,
    accountIdx
  );
}

export async function fetchChildFolders(
  parentId: string,
  token: string,
  accountIdx: number
): Promise<MailFolder[]> {
  return fetchAllPages(
    `/me/mailFolders/${parentId}/childFolders?$top=100&$select=${FOLDER_SELECT}`,
    token,
    accountIdx
  );
}

/** Max simultaneous in-flight child-folder requests across the whole recursive walk — avoids 429 storms on wide/deep folder trees. */
const MAX_CONCURRENT_FOLDER_FETCHES = 4;

/**
 * Recursively fetch all folders up to an arbitrary depth.
 * Mirrors fetchFoldersRecursive() at lines 9294–9363 of New-mailbox.html —
 * notably its error handling: that version wraps its *own* list-fetch in a
 * try/catch (not just its recursive calls into children), so every
 * recursion level is self-protecting and the function never throws, only
 * ever returns whatever it managed to gather. An earlier version of this
 * port only caught failures in the recursive call to children, leaving the
 * outermost (root-level) fetch unprotected — so on an account where the
 * root /me/mailFolders call hit so much as one transient error, the whole
 * tree came back empty with a hard failure, where the legacy app just
 * quietly moved on. Catching at every level, root included, matches that
 * resilience.
 *
 * Runs with bounded concurrency (a shared semaphore, not per-level Promise.all)
 * so a wide tree doesn't fire dozens of parallel requests and trip Graph's
 * rate limiter.
 */
export async function fetchFoldersRecursive(
  token: string,
  accountIdx: number,
  parentId?: string
): Promise<MailFolder[]> {
  let active = 0;
  const queue: Array<() => void> = [];
  async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= MAX_CONCURRENT_FOLDER_FETCHES) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  }

  async function walk(pid: string | undefined): Promise<MailFolder[]> {
    let folders: MailFolder[];
    try {
      folders = pid
        ? await fetchChildFolders(pid, token, accountIdx)
        : await fetchRootFolders(token, accountIdx);
    } catch (e) {
      console.warn(`[folders] Failed to fetch folders for ${pid ?? 'root'}:`, (e as Error).message);
      return [];
    }

    await Promise.all(
      folders.map(async (folder) => {
        if ((folder.childFolderCount ?? 0) > 0) {
          folder.children = await withLimit(() => walk(folder.id));
        }
      })
    );

    return folders;
  }

  return walk(parentId);
}

export async function createFolder(
  displayName: string,
  token: string,
  accountIdx: number,
  parentId?: string
): Promise<MailFolder> {
  const endpoint = parentId
    ? `/me/mailFolders/${parentId}/childFolders`
    : '/me/mailFolders';
  return graphApi(endpoint, token, 'POST', { displayName }, 3, accountIdx) as Promise<MailFolder>;
}

export async function deleteFolder(
  folderId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/mailFolders/${folderId}`, token, 'DELETE', null, 3, accountIdx);
}

export async function renameFolder(
  folderId: string,
  displayName: string,
  token: string,
  accountIdx: number
): Promise<MailFolder> {
  return graphApi(
    `/me/mailFolders/${folderId}`,
    token,
    'PATCH',
    { displayName },
    3,
    accountIdx
  ) as Promise<MailFolder>;
}
