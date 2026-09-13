export type Folder = 'inbox' | 'spam' | 'trash' | 'sent';

export type AddressType = 'block' | 'white';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export interface Email {
    id: string;
    message_id: string | null;
    folder: Folder;
    subject: string;
    sender: string;
    sender_name: string | null;
    recipient: string;
    cc: string | null;
    bcc: string | null;
    date: string;
    is_read: number;
    is_starred: number;
    /** List rows carry a short `snippet` instead of the full bodies. */
    snippet?: string | null;
    body_html?: string | null;
    body_text?: string | null;
    size: number;
    in_reply_to: string | null;
    thread_id: string | null;
    has_attachments: number;
    created_at: string;
}

export interface Attachment {
    id: string;
    email_id: string;
    filename: string;
    mimetype: string;
    size: number;
    content_id: string | null;
    disposition: string | null;
}

export interface Address {
    id: string;
    address: string;
    type: AddressType;
    note: string | null;
    created_at: string;
}

export interface RuntimeSettings {
    blockPolicy: BlockPolicy[];
    forwardList: string[];
    maxEmailSize: number;
    maxEmailSizePolicy: MaxEmailSizePolicy;
    summaryEnabled: boolean;
    openaiApiKey: string;
    workersAiModel: string;
    openaiChatModel: string;
    openaiCompletionsApi: string;
    summaryTargetLang: string;
    forwardEnabled: boolean;
    /** Days of mail history kept by the daily cron; 0 disables auto cleanup. Defaults to 7. */
    autoCleanupDays: number;
    /** Store inbound attachments in R2. */
    attachmentSaveEnabled: boolean;
    /** Skip saving individual attachments larger than this many bytes. */
    attachmentMaxSize: number;
}

export interface TelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
}

export interface MeResponse {
    user: TelegramUser;
    resendEnabled: boolean;
    settings: RuntimeSettings;
}

export interface EmailListResponse {
    emails: Email[];
    total: number;
    unread: number;
}

export interface EmailDetailResponse {
    email: Email;
    attachments: Attachment[];
    resendEnabled: boolean;
    summaryEnabled: boolean;
}

export interface AddressTestResponse {
    status: 'white' | 'block' | 'no_match';
    matchedWhite: string[];
    matchedBlock: string[];
}

export interface ImportEnvResponse {
    settings: RuntimeSettings;
    importedAddresses: { white: number; block: number };
}

export interface CleanupPreviewResponse {
    emails: number;
    attachments: number;
}

export interface CleanupResponse {
    emails: number;
    attachments: number;
    /** Rows still inside the range; very large backlogs need another pass. */
    remaining: number;
}
