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
    body_html: string | null;
    body_text: string | null;
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
    guardianMode: boolean;
    mailTtl: number;
    maxEmailSize: number;
    maxEmailSizePolicy: MaxEmailSizePolicy;
    summaryEnabled: boolean;
    workersAiModel: string;
    openaiChatModel: string;
    openaiCompletionsApi: string;
    summaryTargetLang: string;
    forwardEnabled: boolean;
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
