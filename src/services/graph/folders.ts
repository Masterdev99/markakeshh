/**
 * Folders Graph API service — verbatim port of fetchFoldersRecursive() from
 * new-mailbox.html (lines 9294–9363). The previous rebuild-against-the-docs
 * version (nested tree, Promise.all concurrency, root/child error asymmetry)
 * didn't work in practice, so this restores the original's exact algorithm
 * instead: a flat array where each folder carries its own `depth`, fetched
 * one request at a time via plain sequential `for...of` + `await`, with a
 * single try/catch around the whole walk that warns and returns whatever was
 * collected so far rather than throwing.
 */

import { graphApi } from './client';
import type { MailFolder } from '../../types';

interface FolderListResponse {
  value: MailFolder[];
  '@odata.nextLink'?: string;
}

/** GET /me/mailFolders (root) or /me/mailFolders/{parentId}/childFolders, recursing into every child. Returns a flat, depth-first array — not a nested tree. */
export async function fetchFoldersRecursive(
  token: string,
  accountIdx: number,
  parentId: string | null = null,
  depth = 0
): Promise<MailFolder[]> {
  let all: MailFolder[] = [];
  let url = parentId
    ? `/me/mailFolders/${parentId}/childFolders`
    : '/me/mailFolders';
  url += '?$top=100&$select=id,displayName,totalItemCount,unreadItemCount,childFolderCount';

  try {
    let res = (await graphApi(url, token, 'GET', null, 3, accountIdx)) as FolderListResponse;
    let folders = res.value || [];

    for (const f of folders) {
      f.depth = depth;
      all.push(f);
      if ((f.childFolderCount ?? 0) > 0) {
        const children = await fetchFoldersRecursive(token, accountIdx, f.id, depth + 1);
        all = all.concat(children);
      }
    }

    // Handle pagination for this level
    let nextLink = res['@odata.nextLink'];
    while (nextLink) {
      const nextUrl = nextLink.replace('https://graph.microsoft.com/v1.0', '');
      res = (await graphApi(nextUrl, token, 'GET', null, 3, accountIdx)) as FolderListResponse;
      const nextFolders = res.value || [];
      for (const f of nextFolders) {
        f.depth = depth;
        all.push(f);
        if ((f.childFolderCount ?? 0) > 0) {
          const children = await fetchFoldersRecursive(token, accountIdx, f.id, depth + 1);
          all = all.concat(children);
        }
      }
      nextLink = res['@odata.nextLink'];
    }
  } catch (e) {
    console.warn(`Failed to fetch folders for ${parentId || 'root'}:`, (e as Error).message);
  }
  return all;
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
