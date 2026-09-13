/**
 * The HTTP contract between the worker (`@mail2telegram/server`) and the Telegram
 * Mini App (`@mail2telegram/web`).
 *
 * Both sides are compiled separately, so a type repeated on each side can drift
 * without any compile-time signal. Everything that crosses the wire belongs here
 * and nowhere else. This package is intentionally types-only: it has no runtime
 * exports, so importing it never pulls code into either bundle.
 */

export type Folder = 'inbox' | 'spam' | 'trash' | 'sent';

export type MaxEmailSizePolicy = 'unhandled' | 'continue' | 'truncate';

export type BlockPolicy = 'reject' | 'forward' | 'telegram';

export type AddressType = 'block' | 'white';

/** Backend that generates email summaries. */
export type SummaryProvider = 'workers-ai' | 'openai';

/** Telegram user as embedded in Mini App `initData`. */
export interface TelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
}

/** Runtime settings editable from the Telegram Mini App. */
export interface RuntimeSettings {
    blockPolicy: BlockPolicy[];
    forwardList: string[];
    maxEmailSize: number;
    maxEmailSizePolicy: MaxEmailSizePolicy;
    summaryEnabled: boolean;
    /** Which backend the summary request goes to. */
    summaryProvider: SummaryProvider;
    /** Chat model of the selected provider (`@cf/...` or OpenAI-compatible id). */
    workersAiModel: string;
    openaiApiKey: string;
    openaiChatModel: string;
    /** Origin + path of the OpenAI-compatible API, e.g. `https://api.openai.com/v1`. */
    openaiBaseUrl: string;
    summaryTargetLang: string;
    forwardEnabled: boolean;
    /** Days of mail history kept by the daily cron; 0 disables auto cleanup. */
    autoCleanupDays: number;
    /** Store inbound attachments in R2; requires the BUCKET binding. */
    attachmentSaveEnabled: boolean;
    /** Skip saving individual attachments larger than this many bytes. */
    attachmentMaxSize: number;
}

/**
 * Email as serialized to the Mini App. The worker returns a superset of this
 * shape (internal columns such as `raw_key` are present at runtime); only the
 * fields the client is allowed to rely on are declared here. List rows carry a
 * short `snippet` and omit the bodies, while detail rows add `body_html` /
 * `body_text`.
 */
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

/** Attachment metadata as exposed to the Mini App (no R2 key). */
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

/**
 * Public auth capabilities of the worker, served without credentials so the
 * frontend can decide between the password login and the landing page.
 */
export interface AuthResponse {
    /** True when `WEB_PASSWORD` is configured and browser login is possible. */
    passwordEnabled: boolean;
}

/**
 * Browser session issued by `POST /api/auth/login`. The token is a stateless
 * HMAC over its own expiry, so rotating `WEB_PASSWORD` revokes every session.
 * The raw password is never persisted by the browser.
 */
export interface AuthLoginResponse {
    token: string;
    /** ISO timestamp when the token stops validating. */
    expiresAt: string;
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

/** Response of the settings endpoints; also reports provider capabilities. */
export interface SettingsResponse {
    settings: RuntimeSettings;
    /** True when the worker has the Workers AI binding, so the provider is usable. */
    workersAiAvailable: boolean;
}

/** Body of `POST /api/settings/ai/models`. */
export interface AiModelsRequest {
    provider: SummaryProvider;
    /** OpenAI-compatible base URL; falls back to the stored setting when omitted. */
    baseUrl?: string;
    /** API token; falls back to the stored setting when omitted. */
    apiKey?: string;
}

/** Model ids offered by the requested provider, sorted. */
export interface AiModelsResponse {
    models: string[];
}
