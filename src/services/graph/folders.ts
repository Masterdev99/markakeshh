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

export async function fetchRootFolders(token: string, accountIdx: number): Promise<MailFolder[]> {
  const resp = await graphApi(
    '/me/mailFolders?$top=100&$select=id,displayName,unreadItemCount,totalItemCount,childFolderCount,parentFolderId',
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as FolderListResponse;
  return resp.value ?? [];
}

export async function fetchChildFolders(
  parentId: string,
  token: string,
  accountIdx: number
): Promise<MailFolder[]> {
  const resp = await graphApi(
    `/me/mailFolders/${parentId}/childFolders?$top=100&$select=id,displayName,unreadItemCount,totalItemCount,childFolderCount,parentFolderId`,
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as FolderListResponse;
  return resp.value ?? [];
}

/** Max simultaneous in-flight child-folder requests across the whole recursive walk — avoids 429 storms on wide/deep folder trees. */
const MAX_CONCURRENT_FOLDER_FETCHES = 4;

/**
 * Recursively fetch all folders up to an arbitrary depth.
 * Mirrors fetchFoldersRecursive() at lines 8926–8996.
 *
 * Runs with bounded concurrency (a shared semaphore, not per-level Promise.all)
 * so a wide tree doesn't fire dozens of parallel requests and trip Graph's
 * rate limiter. Each branch's failure is caught and isolated — a single
 * folder that fails to load keeps its already-fetched shape (with an
 * `error` flag) instead of rejecting the entire tree and leaving every
 * other folder blank.
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
    const folders = pid
      ? await fetchChildFolders(pid, token, accountIdx)
      : await fetchRootFolders(token, accountIdx);

    await Promise.all(
      folders.map(async (folder) => {
        if ((folder.childFolderCount ?? 0) > 0) {
          try {
            folder.children = await withLimit(() => walk(folder.id));
          } catch (e) {
            console.error(`[folders] Failed to load children of "${folder.displayName}":`, e);
            folder.children = [];
            folder.loadError = true;
          }
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
