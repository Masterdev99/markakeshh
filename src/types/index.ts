// ==================== ACCOUNT ====================
export interface Account {
  id: string;
  accessToken: string;
  refreshToken?: string | null;
  email: string;
  displayName?: string;
  label?: string | null;
  clientId?: string;
  tenantId?: string;
  addedAt?: string;
  tokenRefreshedAt?: string;
  feedId?: string | null;
  autoImported?: boolean;
  lastFeedSync?: string;
  unreadCount?: number;
}

// ==================== FOLDER ====================
// Flat model — a folder tree is a flat array where each entry carries its
// own nesting `depth`, exactly as new-mailbox.html's fetchFoldersRecursive
// produces it (a depth-first walk, not a nested children[] tree).
export interface MailFolder {
  id: string;
  displayName: string;
  unreadItemCount: number;
  totalItemCount: number;
  childFolderCount?: number;
  depth: number;
}

// ==================== MESSAGE ====================
export interface EmailAddress {
  name: string;
  address: string;
}

export interface Recipient {
  emailAddress: EmailAddress;
}

export interface MessageFlag {
  flagStatus: 'notFlagged' | 'flagged' | 'complete';
}

export interface Message {
  id: string;
  subject: string;
  bodyPreview?: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  from?: Recipient;
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  bccRecipients?: Recipient[];
  replyTo?: Recipient[];
  receivedDateTime: string;
  sentDateTime?: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance: 'low' | 'normal' | 'high';
  flag?: MessageFlag;
  categories?: string[];
  conversationId?: string;
  internetMessageId?: string;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  size?: number;
  parentFolderId?: string;
  /** Client-side annotation set during a multi-folder search — the display name of the folder this result lives in. */
  folderName?: string;
}

export interface MessageListResponse {
  value: Message[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
}

// ==================== ATTACHMENT ====================
export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  contentId?: string;
  contentBytes?: string;
}

// ==================== SIGNATURE ====================
export interface Signature {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
}

// ==================== LOCAL CONSOLE RULE ====================
export interface RuleCondition {
  type: string;
  value: string;
}

export interface RuleActions {
  moveToFolder?: string;
  moveToFolderName?: string;
  copyToFolder?: string;
  copyToFolderName?: string;
  markAsRead?: boolean;
  forwardTo?: string;
  permanentDelete?: boolean;
  flagMessage?: boolean;
  markImportant?: boolean;
  categorize?: string;
}

export interface LocalConsoleRule {
  id: string;
  displayName: string;
  isEnabled: boolean;
  conditions: {
    all?: RuleCondition[];
    type?: string;
    value?: string;
  };
  actions: RuleActions;
}

// ==================== INBOX RULE (SERVER-SIDE) ====================
export interface InboxRule {
  id: string;
  displayName: string;
  sequence: number;
  isEnabled: boolean;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
}

// ==================== SMTP / TELEGRAM SETTINGS ====================
export interface SmtpSettings {
  host: string; // bot token
  user: string; // chat id
}

// ==================== FEED SETTINGS ====================
export interface FeedSettings {
  url: string;
  interval: number; // seconds
}

// ==================== CALENDAR ====================
export interface CalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string; date?: string };
  end: { dateTime: string; timeZone: string; date?: string };
  location?: { displayName: string };
  isOnlineMeeting?: boolean;
  isAllDay?: boolean;
  organizer?: { emailAddress: EmailAddress };
  bodyPreview?: string;
}

// ==================== ONEDRIVE ====================
export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  webUrl?: string;
  parentReference?: { id: string; name: string };
  '@microsoft.graph.downloadUrl'?: string;
}

// ==================== ADMIN ====================
export interface DirectoryUser {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName: string;
  accountEnabled?: boolean;
  jobTitle?: string;
  department?: string;
  assignedLicenses?: Array<{ skuId: string }>;
  usageLocation?: string;
  createdDateTime?: string;
}

export interface DirectoryRole {
  id: string;
  displayName: string;
  description?: string;
}

// ==================== GRAPH RESPONSE WRAPPERS ====================
export interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
  '@odata.count'?: number;
}

export interface GraphError {
  error: {
    code: string;
    message: string;
    innerError?: Record<string, unknown>;
  };
}
