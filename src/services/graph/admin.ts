/**
 * Admin / Directory Graph API service.
 * Ported from lines 13572–13631, 15000–16745.
 *
 * CAUTION: The "Create User / View All Users" shortcut that was deliberately
 * removed from the original app MUST NOT appear here. This service covers
 * only the legitimate Admin → Users feature.
 */

import { graphApi } from './client';
import type { DirectoryUser, DirectoryRole, GraphListResponse } from '../../types';

// ==================== ROLE DETECTION ====================

export const ADMIN_ROLE_IDS: Record<string, string> = {
  'Global Administrator': '62e90394-69f5-4237-9190-012177145e10',
  'Exchange Administrator': '29232cdf-9323-42fd-ade2-1d097af3e4de',
  'SharePoint Administrator': 'f28a1f50-f6e7-4571-818b-6a12f2af6b6c',
  'User Administrator': 'fe930be7-5e62-47db-91af-98c3a49a38b1',
  'Teams Administrator': '69091246-20e8-4a56-aa4d-066075b2a7a8',
  'Security Administrator': '194ae4cb-b126-40b2-bd5b-6091b380977d',
  'Privileged Role Administrator': 'e8611ab8-c189-46e8-94e1-60213ab1f814',
  'License Administrator': '4d6ac14f-3453-41d0-bef9-a3e0c569773a',
};

export async function fetchMyRoles(token: string, accountIdx: number): Promise<DirectoryRole[]> {
  const resp = await graphApi(
    '/me/memberOf/microsoft.graph.directoryRole?$select=id,displayName,description',
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as GraphListResponse<DirectoryRole>;
  return resp.value ?? [];
}

// ==================== USERS ====================

export async function fetchUsers(
  token: string,
  accountIdx: number,
  top = 50,
  nextLink?: string
): Promise<GraphListResponse<DirectoryUser>> {
  const endpoint = nextLink
    ? nextLink.replace('https://graph.microsoft.com/v1.0', '')
    : `/users?$top=${top}&$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle,department,assignedLicenses,usageLocation,createdDateTime&$orderby=displayName&$count=true`;
  return graphApi(
    endpoint,
    token,
    'GET',
    null,
    3,
    accountIdx,
    { ConsistencyLevel: 'eventual' }
  ) as Promise<GraphListResponse<DirectoryUser>>;
}

export async function fetchUsersCount(token: string, accountIdx: number): Promise<number> {
  return graphApi(
    '/users/$count',
    token,
    'GET',
    null,
    3,
    accountIdx,
    { ConsistencyLevel: 'eventual' }
  ) as Promise<number>;
}

export async function searchUsers(
  query: string,
  token: string,
  accountIdx: number
): Promise<GraphListResponse<DirectoryUser>> {
  const endpoint = `/users?$search="displayName:${encodeURIComponent(query)}" OR "mail:${encodeURIComponent(query)}"&$top=50&$select=id,displayName,mail,userPrincipalName,accountEnabled,jobTitle&$count=true`;
  return graphApi(
    endpoint,
    token,
    'GET',
    null,
    3,
    accountIdx,
    { ConsistencyLevel: 'eventual' }
  ) as Promise<GraphListResponse<DirectoryUser>>;
}

export async function fetchUser(
  userId: string,
  token: string,
  accountIdx: number
): Promise<DirectoryUser> {
  return graphApi(`/users/${userId}`, token, 'GET', null, 3, accountIdx) as Promise<DirectoryUser>;
}

export async function updateUser(
  userId: string,
  payload: Partial<DirectoryUser>,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/users/${userId}`, token, 'PATCH', payload, 3, accountIdx);
}

export async function enableDisableUser(
  userId: string,
  enabled: boolean,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/users/${userId}`, token, 'PATCH', { accountEnabled: enabled }, 3, accountIdx);
}

export async function resetPassword(
  userId: string,
  passwordProfile: { password: string; forceChangePasswordNextSignIn: boolean },
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/users/${userId}`, token, 'PATCH', { passwordProfile }, 3, accountIdx);
}

// ==================== USER MAILBOX (ADMIN VIEW) ====================

export async function fetchUserMailbox(
  userId: string,
  token: string,
  accountIdx: number
): Promise<unknown> {
  return graphApi(
    `/users/${userId}/mailFolders/Inbox/messages?$top=20&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead,hasAttachments`,
    token,
    'GET',
    null,
    3,
    accountIdx
  );
}

export async function fetchUserMessage(
  userId: string,
  messageId: string,
  token: string,
  accountIdx: number
): Promise<unknown> {
  return graphApi(`/users/${userId}/messages/${messageId}?$select=id,subject,body,from,toRecipients,ccRecipients,receivedDateTime`, token, 'GET', null, 3, accountIdx);
}

// ==================== ROLES ====================

export async function fetchDirectoryRoles(token: string, accountIdx: number): Promise<DirectoryRole[]> {
  const resp = await graphApi('/directoryRoles?$select=id,displayName,description', token, 'GET', null, 3, accountIdx) as GraphListResponse<DirectoryRole>;
  return resp.value ?? [];
}

export async function assignUserRole(
  roleId: string,
  userId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(
    `/directoryRoles/${roleId}/members/$ref`,
    token,
    'POST',
    { '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${userId}` },
    3,
    accountIdx
  );
}

export async function removeUserRole(
  roleId: string,
  userId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/directoryRoles/${roleId}/members/${userId}/$ref`, token, 'DELETE', null, 3, accountIdx);
}

// ==================== MFA ====================

export async function fetchUserAuthMethods(
  userId: string,
  token: string,
  accountIdx: number
): Promise<unknown> {
  return graphApi(`/users/${userId}/authentication/methods`, token, 'GET', null, 3, accountIdx);
}

export async function removeAuthMethod(
  userId: string,
  methodType: string,
  methodId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/users/${userId}/authentication/${methodType}/${methodId}`, token, 'DELETE', null, 3, accountIdx);
}

export async function fetchTemporaryAccessPasses(
  userId: string,
  token: string,
  accountIdx: number
): Promise<unknown> {
  return graphApi(`/users/${userId}/authentication/temporaryAccessPassMethods`, token, 'GET', null, 3, accountIdx);
}

// ==================== DEVICES ====================

export async function fetchUserDevices(
  userId: string,
  token: string,
  accountIdx: number
): Promise<unknown> {
  return graphApi(`/users/${userId}/ownedDevices?$select=id,displayName,deviceId,operatingSystem,operatingSystemVersion,isManaged,isCompliant`, token, 'GET', null, 3, accountIdx);
}

export async function removeDevice(
  deviceId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/devices/${deviceId}`, token, 'DELETE', null, 3, accountIdx);
}

// ==================== RISKY USERS ====================

export async function fetchRiskyUsers(token: string, accountIdx: number): Promise<unknown> {
  return graphApi('/identityProtection/riskyUsers?$top=50', token, 'GET', null, 3, accountIdx);
}

export async function dismissRiskyUsers(
  userIds: string[],
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(
    '/identityProtection/riskyUsers/dismiss',
    token,
    'POST',
    { userIds },
    3,
    accountIdx
  );
}

// ==================== AUDIT LOGS ====================

export async function fetchAuditLogs(token: string, accountIdx: number, top = 50): Promise<unknown> {
  return graphApi(
    `/auditLogs/directoryAudits?$top=${top}&$orderby=activityDateTime desc`,
    token,
    'GET',
    null,
    3,
    accountIdx
  );
}

export async function fetchSignInLogs(token: string, accountIdx: number, top = 50): Promise<unknown> {
  return graphApi(
    `/auditLogs/signIns?$top=${top}&$orderby=createdDateTime desc`,
    token,
    'GET',
    null,
    3,
    accountIdx
  );
}

// ==================== LICENSES / DOMAINS / ORG ====================

export async function fetchSubscribedSkus(token: string, accountIdx: number): Promise<unknown> {
  return graphApi('/subscribedSkus', token, 'GET', null, 3, accountIdx);
}

export async function fetchDomains(token: string, accountIdx: number): Promise<unknown> {
  return graphApi('/domains', token, 'GET', null, 3, accountIdx);
}

export async function fetchOrgInfo(token: string, accountIdx: number): Promise<unknown> {
  return graphApi('/organization?$select=id,displayName,verifiedDomains,createdDateTime,city,country', token, 'GET', null, 3, accountIdx);
}

// ==================== MAIL DELEGATION ====================

export async function fetchUserDelegation(
  userId: string,
  token: string,
  accountIdx: number
): Promise<unknown> {
  return graphApi(`/users/${userId}/mailboxSettings`, token, 'GET', null, 3, accountIdx);
}
