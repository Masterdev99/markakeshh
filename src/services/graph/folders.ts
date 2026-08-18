/**
 * Folders Graph API service — rebuilt against the official Microsoft Graph
 * documentation rather than ported line-for-line from the legacy app:
 *   - List mailFolders: https://learn.microsoft.com/en-us/graph/api/user-list-mailfolders
 *   - List childFolders: https://learn.microsoft.com/en-us/graph/api/mailfolder-list-childfolders
 *   - mailFolder resource: https://learn.microsoft.com/en-us/graph/api/resources/mailfolder
 *
 * Two things the docs make explicit that are easy to get wrong:
 *
 * 1. The default page size for both of these list endpoints is only 10
 *    items — not 100, not "whatever fits." Without an explicit $top AND
 *    without following @odata.nextLink, a mailbox with more than 10 folders
 *    at one level (trivially common) silently loses folders. Both are
 *    handled here (fetchAllPages follows nextLink; $top is set explicitly).
 *
 * 2. There is no bulk "get the whole tree in one call" endpoint. The docs
 *    say so directly: "This operation doesn't return all mail folders in a
 *    mailbox, only the child folders of the root folder. To return all mail
 *    folders in a mailbox, each child folder must be traversed separately."
 *    $expand=childFolders exists as a relationship but Graph doesn't
 *    document reliable nested-pagination behavior for it at arbitrary
 *    depth, so the safe, doc-sanctioned approach is still a plain recursive
 *    walk over childFolders — which is what this does.
 */

import { graphApi } from './client';
import type { MailFolder } from '../../types';

interface FolderListResponse {
  value: MailFolder[];
  '@odata.nextLink'?: string;
}

// All five are documented mailFolder properties this app actually uses.
// (parentFolderId isn't read anywhere — the tree is built by recursing
// through childFolders, not by reassembling it from parent ids — but it's
// an ordinary, always-present property per every example in the docs, so
// there's no reason to omit it.)
const FOLDER_SELECT = 'id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount,isHidden';
const FOLDER_PAGE_SIZE = 100;

/** Follows @odata.nextLink so a folder list longer than one page (the API's default page size is just 10 items) isn't silently truncated. */
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

/** GET /me/mailFolders — the folders directly under the mailbox root (not the full tree). */
export async function fetchRootFolders(token: string, accountIdx: number): Promise<MailFolder[]> {
  return fetchAllPages(`/me/mailFolders?$top=${FOLDER_PAGE_SIZE}&$select=${FOLDER_SELECT}`, token, accountIdx);
}

/** GET /me/mailFolders/{id}/childFolders — one folder's immediate children. */
export async function fetchChildFolders(
  parentId: string,
  token: string,
  accountIdx: number
): Promise<MailFolder[]> {
  return fetchAllPages(`/me/mailFolders/${parentId}/childFolders?$top=${FOLDER_PAGE_SIZE}&$select=${FOLDER_SELECT}`, token, accountIdx);
}

/**
 * Max simultaneous in-flight folder-list requests across the whole
 * recursive walk. Kept at 1 — fully sequential — to match the concurrency
 * profile of New-mailbox.html's own recursion (a plain `for...of` loop with
 * `await` inside: never more than one request in flight for the whole
 * tree), which is the version known to work against accounts sitting
 * behind tighter tenant-side throttling than a few concurrent requests can
 * tolerate.
 */
const MAX_CONCURRENT_FOLDER_FETCHES = 1;

/**
 * Recursively fetches the full folder tree.
 *
 * Error handling is deliberately asymmetric between the root and deeper
 * levels:
 *
 *  - A failure fetching a folder's CHILDREN is caught and pruned to an
 *    empty array for just that branch — one bad or throttled subfolder
 *    doesn't blank out every other folder in the tree.
 *  - A failure fetching the ROOT list is allowed to throw. An earlier
 *    version of this caught that too and silently returned an empty tree —
 *    which meant an account with a genuine, persistent problem (expired
 *    consent, missing permission, anything non-transient) showed an empty
 *    folder sidebar with *no visible explanation*, indistinguishable from
 *    an account that simply has no folders. Throwing here lets it surface
 *    through react-query's error state, where the UI shows the actual
 *    Graph error message and a Retry button (see FolderSidebar) — you can't
 *    fix what you can't see.
 *
 * Both still benefit from the live-sync-triggered refetch in MailView
 * (invalidates ['folders', account.id] on new mail and on first sync),
 * which gives a transient root failure another attempt without the user
 * needing to notice and click Retry themselves.
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

  async function walk(pid: string | undefined, isRoot: boolean): Promise<MailFolder[]> {
    let folders: MailFolder[];
    if (isRoot) {
      folders = await fetchRootFolders(token, accountIdx); // let errors propagate — see doc comment
    } else {
      try {
        folders = await fetchChildFolders(pid as string, token, accountIdx);
      } catch (e) {
        console.warn(`[folders] Failed to fetch children of folder ${pid}:`, (e as Error).message);
        return [];
      }
    }

    await Promise.all(
      folders.map(async (folder) => {
        if ((folder.childFolderCount ?? 0) > 0) {
          folder.children = await withLimit(() => walk(folder.id, false));
        }
      })
    );

    return folders;
  }

  return walk(parentId, parentId === undefined);
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
