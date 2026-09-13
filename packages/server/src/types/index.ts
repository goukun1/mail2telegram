import type { Ai, D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Address, Folder, MaxEmailSizePolicy } from '@mail2telegram/shared';

/**
 * Cross-boundary contract types live in `@mail2telegram/shared` and are
 * re-exported here so worker code keeps a single import path. Only the types
 * below are worker-internal: the D1 row shapes, the parsed-mail shapes and the
 * binding environment.
 */
export type {
    Address,
    AddressTestResponse,
    AddressType,
    Attachment,
    AuthLoginResponse,
    AuthResponse,
    BlockPolicy,
    CleanupPreviewResponse,
    CleanupResponse,
    Email,
    EmailDetailResponse,
    EmailListResponse,
    Folder,
    ImportEnvResponse,
    MaxEmailSizePolicy,
    MeResponse,
    RuntimeSettings,
    TelegramUser,
} from '@mail2telegram/shared';

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
    /** List-only preview column; absent from detail (`EMAIL_COLUMNS`) rows. */
    snippet?: string | null;
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

/** Row shape of the `addresses` table; identical to the wire shape. */
export type AddressRecord = Address;

export interface TelegramMessageRecord {
    telegram_message_id: string;
    chat_id: string;
    email_id: string;
    created_at: string;
}

export interface MailStatusRecord {
    message_id: string;
    telegram: number;
    forwards: string;
    updated_at: string;
}

export interface Environment {
    TELEGRAM_TOKEN: string;
    TELEGRAM_ID: string;
    DOMAIN: string;
    FORWARD_LIST: string;
    BLOCK_LIST: string;
    WHITE_LIST: string;
    BLOCK_POLICY: string;
    MAX_EMAIL_SIZE?: string;
    MAX_EMAIL_SIZE_POLICY?: MaxEmailSizePolicy;
    ATTACHMENT_SAVE_ENABLED?: string;
    ATTACHMENT_MAX_SIZE?: string;
    OPENAI_API_KEY?: string;
    OPENAI_COMPLETIONS_API?: string;
    OPENAI_CHAT_MODEL?: string;
    WORKERS_AI_MODEL?: string;
    SUMMARY_TARGET_LANG?: string;
    /** Days of mail history kept by the daily cron; 0 disables it. Defaults to 7. */
    AUTO_CLEANUP_DAYS?: string;
    RESEND_API_KEY?: string;
    DEBUG?: string;
    /**
     * Optional password for opening the inbox in a plain browser outside
     * Telegram. Empty or absent restricts access to the Telegram Mini App.
     */
    WEB_PASSWORD?: string;
    DB: D1Database;
    BUCKET?: R2Bucket;
    AI?: Ai;
}
