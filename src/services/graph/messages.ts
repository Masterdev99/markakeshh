/**
 * Messages Graph API service.
 *
 * All message-related Graph endpoints live here.
 * Ported from the message list (lines 9164–9276), reading pane (9405–9740),
 * and bulk actions (8790–8925, 12028–12161) sections.
 */

import { graphApi } from './client';
import { mapWithConcurrency } from '../../utils/concurrency';
import type { Message, MessageListResponse, Attachment } from '../../types';

/** Max simultaneous in-flight requests for a single bulk operation — keeps large batches (e.g. sweeping hundreds of messages) from firing every request at once and tripping the browser's own connection limits (net::ERR_INSUFFICIENT_RESOURCES). */
const MAX_CONCURRENT_BULK_REQUESTS = 6;

const WELL_KNOWN_FOLDERS: Record<string, string> = {
  inbox: 'Inbox',
  drafts: 'Drafts',
  sentitems: 'SentItems',
  deleteditems: 'DeletedItems',
  junkemail: 'JunkEmail',
  archive: 'Archive',
  outbox: 'Outbox',
};

function folderPath(folder: string): string {
  return WELL_KNOWN_FOLDERS[folder.toLowerCase()] ?? folder;
}

// ==================== LIST MESSAGES ====================

const MESSAGE_LIST_SELECT =
  'id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,hasAttachments,importance,flag,categories';

interface LoadMessagesOptions {
  folderId: string;
  accountIdx: number;
  token: string;
  top?: number;
  nextLink?: string;
}

export async function fetchMessages(opts: LoadMessagesOptions): Promise<MessageListResponse> {
  const { folderId, accountIdx, token, top = 50, nextLink } = opts;

  let endpoint: string;
  if (nextLink) {
    // nextLink is an absolute URL — strip the base to get the path
    endpoint = nextLink.replace('https://graph.microsoft.com/v1.0', '');
  } else {
    const fp = folderPath(folderId);
    endpoint = `/me/mailFolders/${fp}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${MESSAGE_LIST_SELECT}`;
  }

  return graphApi(endpoint, token, 'GET', null, 3, accountIdx) as Promise<MessageListResponse>;
}

export async function fetchAllMessages(opts: Omit<LoadMessagesOptions, 'nextLink'>): Promise<Message[]> {
  const all: Message[] = [];
  let nextLink: string | undefined;
  do {
    const resp = await fetchMessages({ ...opts, nextLink });
    all.push(...(resp.value ?? []));
    nextLink = resp['@odata.nextLink'];
  } while (nextLink);
  return all;
}

// ==================== SEARCH ====================

// Search results additionally carry parentFolderId so callers can show a
// folder-name badge when a search spans more than one folder (All/Subfolders).
const SEARCH_SELECT = `${MESSAGE_LIST_SELECT},parentFolderId`;

export async function searchMessages(
  query: string,
  token: string,
  accountIdx: number
): Promise<MessageListResponse> {
  const endpoint = `/me/messages?$search="${encodeURIComponent(query)}"&$top=50&$select=${SEARCH_SELECT}`;
  return graphApi(endpoint, token, 'GET', null, 3, accountIdx) as Promise<MessageListResponse>;
}

/** Searches a single mail folder (used for "current folder" scope and as the per-folder call for "subfolders" scope). */
export async function searchMessagesInFolder(
  folderId: string,
  query: string,
  token: string,
  accountIdx: number
): Promise<MessageListResponse> {
  const fp = folderPath(folderId);
  const endpoint = `/me/mailFolders/${fp}/messages?$search="${encodeURIComponent(query)}"&$top=50&$select=${SEARCH_SELECT}`;
  return graphApi(endpoint, token, 'GET', null, 3, accountIdx) as Promise<MessageListResponse>;
}

// ==================== GET SINGLE MESSAGE ====================

const MESSAGE_DETAIL_SELECT =
  'id,subject,body,from,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,isRead,hasAttachments,importance,flag,categories,conversationId,internetMessageId,internetMessageHeaders';

export async function fetchMessage(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<Message> {
  // IMPORTANT: bccRecipients MUST be in $select — regression #2 if dropped
  return graphApi(
    `/me/messages/${messageId}?$select=${MESSAGE_DETAIL_SELECT}`,
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as Promise<Message>;
}

// ==================== ATTACHMENTS ====================

export async function fetchAttachments(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<Attachment[]> {
  const resp = await graphApi(
    `/me/messages/${messageId}/attachments`,
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as { value: Attachment[] };
  return resp.value ?? [];
}

export async function fetchAttachment(
  messageId: string,
  attachmentId: string,
  token: string,
  accountIdx: number
): Promise<Attachment> {
  return graphApi(
    `/me/messages/${messageId}/attachments/${attachmentId}`,
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as Promise<Attachment>;
}

// ==================== MUTATIONS ====================

export async function markMessageRead(
  messageId: string,
  isRead: boolean,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/messages/${messageId}`, token, 'PATCH', { isRead }, 3, accountIdx);
}

export async function deleteMessage(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/messages/${messageId}`, token, 'DELETE', null, 3, accountIdx);
}

export async function permanentDeleteMessage(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/messages/${messageId}/permanentDelete`, token, 'POST', {}, 3, accountIdx);
}

export async function moveMessage(
  messageId: string,
  destinationId: string,
  token: string,
  accountIdx: number
): Promise<Message> {
  return graphApi(
    `/me/messages/${messageId}/move`,
    token,
    'POST',
    { destinationId },
    3,
    accountIdx
  ) as Promise<Message>;
}

/**
 * Sweep — move every message from the given sender address (mailbox-wide)
 * into a destination folder (e.g. Deleted Items). Mirrors Outlook's "Sweep"
 * quick action. Returns the number of messages moved.
 */
export async function sweepSenderMessages(
  senderAddress: string,
  destinationId: string,
  token: string,
  accountIdx: number
): Promise<number> {
  const filter = `from/emailAddress/address eq '${senderAddress.replace(/'/g, "''")}'`;
  let path: string | null =
    `/me/messages?$filter=${encodeURIComponent(filter)}&$select=id&$top=100`;
  const ids: string[] = [];
  while (path) {
    const data = (await graphApi(path, token, 'GET', null, 3, accountIdx)) as MessageListResponse;
    ids.push(...(data.value || []).map((m) => m.id));
    const nextLink = data['@odata.nextLink'] || null;
    path = nextLink ? nextLink.replace('https://graph.microsoft.com/v1.0', '') : null;
  }
  await mapWithConcurrency(ids, MAX_CONCURRENT_BULK_REQUESTS, (id) => moveMessage(id, destinationId, token, accountIdx));
  return ids.length;
}

export async function flagMessage(
  messageId: string,
  flagged: boolean,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(
    `/me/messages/${messageId}`,
    token,
    'PATCH',
    { flag: { flagStatus: flagged ? 'flagged' : 'notFlagged' } },
    3,
    accountIdx
  );
}

// ==================== SEND ====================

export async function sendMail(
  payload: unknown,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi('/me/sendMail', token, 'POST', payload, 3, accountIdx);
}

// ==================== REPLY / FORWARD ====================

export async function createReply(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<Message> {
  return graphApi(`/me/messages/${messageId}/createReply`, token, 'POST', {}, 3, accountIdx) as Promise<Message>;
}

export async function createReplyAll(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<Message> {
  return graphApi(`/me/messages/${messageId}/createReplyAll`, token, 'POST', {}, 3, accountIdx) as Promise<Message>;
}

export async function createForward(
  messageId: string,
  token: string,
  accountIdx: number
): Promise<Message> {
  return graphApi(`/me/messages/${messageId}/createForward`, token, 'POST', {}, 3, accountIdx) as Promise<Message>;
}

export async function sendDraftMessage(
  draftId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/messages/${draftId}/send`, token, 'POST', {}, 3, accountIdx);
}

export async function updateDraftMessage(
  draftId: string,
  payload: Partial<Message>,
  token: string,
  accountIdx: number
): Promise<Message> {
  return graphApi(`/me/messages/${draftId}`, token, 'PATCH', payload, 3, accountIdx) as Promise<Message>;
}

// ==================== LIVE SYNC (poll) ====================

const SYNC_SELECT =
  'id,subject,bodyPreview,from,toRecipients,receivedDateTime,isRead,hasAttachments,importance,flag,categories';

export async function fetchLatestMessages(
  folderId: string,
  token: string,
  accountIdx: number,
  top = 10
): Promise<Message[]> {
  const fp = folderPath(folderId);
  const endpoint = `/me/mailFolders/${fp}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${SYNC_SELECT}`;
  const resp = await graphApi(endpoint, token, 'GET', null, 3, accountIdx) as MessageListResponse;
  return resp.value ?? [];
}
