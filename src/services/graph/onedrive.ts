/**
 * OneDrive Graph API service.
 * Ported from lines 13708–14009.
 *
 * Note: OneDrive has its OWN delete-selected flow — do not merge with mail's bulk delete.
 */

import { graphApi } from './client';
import type { DriveItem } from '../../types';

interface DriveListResponse {
  value: DriveItem[];
  '@odata.nextLink'?: string;
}

interface DriveQuota {
  total: number;
  used: number;
  remaining: number;
  deleted?: number;
  state?: string;
}

interface DriveResponse {
  id: string;
  quota: DriveQuota;
}

export async function fetchDriveRoot(token: string, accountIdx: number): Promise<DriveItem> {
  return graphApi('/me/drive/root', token, 'GET', null, 3, accountIdx) as Promise<DriveItem>;
}

export async function fetchDriveChildren(
  itemId: string,
  token: string,
  accountIdx: number
): Promise<DriveItem[]> {
  const endpoint = itemId === 'root'
    ? '/me/drive/root/children?$top=100&$orderby=name'
    : `/me/drive/items/${itemId}/children?$top=100&$orderby=name`;
  const resp = await graphApi(endpoint, token, 'GET', null, 3, accountIdx) as DriveListResponse;
  return resp.value ?? [];
}

export async function fetchDriveItem(
  itemId: string,
  token: string,
  accountIdx: number
): Promise<DriveItem> {
  return graphApi(`/me/drive/items/${itemId}`, token, 'GET', null, 3, accountIdx) as Promise<DriveItem>;
}

export async function fetchDriveQuota(token: string, accountIdx: number): Promise<DriveQuota> {
  const resp = await graphApi('/me/drive?$select=id,quota', token, 'GET', null, 3, accountIdx) as DriveResponse;
  return resp.quota;
}

export async function searchOneDrive(
  query: string,
  token: string,
  accountIdx: number
): Promise<DriveItem[]> {
  const resp = await graphApi(
    `/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=50`,
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as DriveListResponse;
  return resp.value ?? [];
}

export async function createDriveFolder(
  parentId: string,
  name: string,
  token: string,
  accountIdx: number
): Promise<DriveItem> {
  const endpoint = parentId === 'root'
    ? '/me/drive/root/children'
    : `/me/drive/items/${parentId}/children`;
  return graphApi(
    endpoint,
    token,
    'POST',
    { name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' },
    3,
    accountIdx
  ) as Promise<DriveItem>;
}

export async function deleteDriveItem(
  itemId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/drive/items/${itemId}`, token, 'DELETE', null, 3, accountIdx);
}

// ── Friendly aliases used by OneDriveView ────────────────────────────────────

export const listDriveItems = fetchDriveChildren;
export const getDriveQuota = fetchDriveQuota;
export const searchDriveItems = searchOneDrive;

export async function uploadDriveFile(
  parentId: string,
  file: File,
  token: string,
  accountIdx: number
): Promise<DriveItem> {
  const buffer = await file.arrayBuffer();
  const endpoint = parentId === 'root'
    ? `/me/drive/root:/${encodeURIComponent(file.name)}:/content`
    : `/me/drive/items/${parentId}:/${encodeURIComponent(file.name)}:/content`;
  return graphApi(
    endpoint,
    token,
    'PUT',
    buffer,
    3,
    accountIdx,
    { 'Content-Type': file.type || 'application/octet-stream' }
  ) as Promise<DriveItem>;
}
