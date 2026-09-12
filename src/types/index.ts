import type { Ai, D1Database, R2Bucket } from '@cloudflare/workers-types';

export type Folder = 'inbox' | 'spam' | 'trash' | 'sent';

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

export type AddressType = 'block' | 'white';

/** Attachment parsed from an inbound email, stored in R2. */
export interface AttachmentRecord {
    id: string;
    email_id: string;
    filename: string;
    mimetype: string;
    size: number;
    content_id: string | null;
    disposition: string | null;
    r2_key: string;
}

/** Row shape of the `emails` table. */
export interface EmailRecord {
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
    raw_key: string | null;
    size: number;
    in_reply_to: string | null;
    references_json: string | null;
    thread_id: string | null;
    raw_headers: string | null;
    has_attachments: number;
    created_at: string;
}

/** Email parsed from an inbound message before being persisted. */
export interface ParsedEmail {
    messageId: string;
    from: string;
    fromName: string | null;
    to: string;
    cc: string | null;
    bcc: string | null;
    subject: string;
    text: string;
    html: string | null;
    inReplyTo: string | null;
    references: string[];
    date: string;
    rawHeaders: string | null;
    attachments: ParsedAttachment[];
}

export interface ParsedAttachment {
    filename: string;
    mimetype: string;
    contentId: string | null;
    disposition: string | null;
    content: ArrayBuffer;
}

export interface ParsedEmailResult extends ParsedEmail {
    /** True when the raw message was truncated before parsing. */
    truncated: boolean;
    /** True when the message exceeded the size limit and was not parsed. */
    unhandled: boolean;
    /** Original raw size in bytes. */
    rawSize: number;
}

export interface AddressRecord {
    id: string;
    address: string;
    type: AddressType;
    note: string | null;
    created_at: string;
}

export interface TelegramMessageRecord {
    telegram_message_id: string;
    email_id: string;
    created_at: string;
}

export interface MailStatusRecord {
    message_id: string;
    telegram: number;
    forwards: string;
    updated_at: string;
}

/** Runtime settings editable from the Telegram Mini App. */
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

export interface Environment {
    TELEGRAM_TOKEN: string;
    TELEGRAM_ID: string;
    DOMAIN: string;
    FORWARD_LIST: string;
    BLOCK_LIST: string;
    WHITE_LIST: string;
    DISABLE_LOAD_REGEX_FROM_DB: string;
    BLOCK_POLICY: string;
    MAIL_TTL: string;
    MAX_EMAIL_SIZE?: string;
    MAX_EMAIL_SIZE_POLICY?: MaxEmailSizePolicy;
    OPENAI_API_KEY?: string;
    OPENAI_COMPLETIONS_API?: string;
    OPENAI_CHAT_MODEL?: string;
    WORKERS_AI_MODEL?: string;
    SUMMARY_TARGET_LANG?: string;
    GUARDIAN_MODE?: string;
    RESEND_API_KEY?: string;
    DEBUG?: string;
    DB: D1Database;
    BUCKET?: R2Bucket;
    AI?: Ai;
}
