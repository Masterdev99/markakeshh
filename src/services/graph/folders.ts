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

/**
 * Recursively fetch all folders up to an arbitrary depth.
 * Mirrors fetchFoldersRecursive() at lines 8926–8996.
 */
export async function fetchFoldersRecursive(
  token: string,
  accountIdx: number,
  parentId?: string,
  depth = 0
): Promise<MailFolder[]> {
  const folders = parentId
    ? await fetchChildFolders(parentId, token, accountIdx)
    : await fetchRootFolders(token, accountIdx);

  const withChildren = await Promise.all(
    folders.map(async (folder) => {
      if ((folder.childFolderCount ?? 0) > 0) {
        folder.children = await fetchFoldersRecursive(token, accountIdx, folder.id, depth + 1);
      }
      return folder;
    })
  );

  return withChildren;
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
