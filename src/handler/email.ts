import type {
    ExecutionContext,
    ForwardableEmailMessage,
    ReadableStream as WorkerReadableStream,
} from '@cloudflare/workers-types';
import type { AttachmentRecord, EmailRecord, Environment, ParsedEmailResult, RuntimeSettings } from '../types';
import { Dao } from '../db';
import { loadSettings } from '../db/settings';
import { hydrateEmail, isMessageBlock, parseEmail, renderEmailListMode } from '../mail';
import { createTelegramBotAPI } from '../telegram';

const BODY_INLINE_LIMIT = 900 * 1024;

async function readAllBytes(stream: WorkerReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

/**
 * Stable identity for one delivery. `Message-ID` is used when the sender
 * provides one. Without it, a content hash keeps a redelivery detectable:
 * a random UUID would differ on every retry, so the journal could never
 * suppress the duplicate and the stored row could never be reused.
 *
 * Hashing requires the full bytes, so header-less mail is buffered once and the
 * same bytes are handed to `parseEmail` instead of re-reading the stream. The
 * message has already passed the reject check, so nothing is buffered only to
 * be discarded.
 */
async function resolveMessageIdentity(
    message: ForwardableEmailMessage,
): Promise<{ id: string; rawBytes: Uint8Array | null }> {
    const header = message.headers.get('Message-ID')?.trim();
    if (header) {
        return { id: header, rawBytes: null };
    }
    const rawBytes = await readAllBytes(message.raw);
    const digest = await crypto.subtle.digest('SHA-256', rawBytes as unknown as ArrayBufferView<ArrayBuffer>);
    const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { id: `sha256:${hex}`, rawBytes };
}

async function persistEmail(
    env: Environment,
    dao: Dao,
    parsed: ParsedEmailResult,
    folder: 'inbox' | 'spam',
    rawSize: number,
    settings: RuntimeSettings,
): Promise<EmailRecord> {
    const id = crypto.randomUUID();
    const attachmentRecords: AttachmentRecord[] = [];

    if (env.BUCKET && settings.attachmentSaveEnabled && parsed.attachments.length > 0) {
        const bucket = env.BUCKET;
        // The puts are independent: run them concurrently and let one failure
        // drop only its own attachment.
        const stored = await Promise.all(
            parsed.attachments.map(async (attachment): Promise<AttachmentRecord | null> => {
                // A limit of zero (or less) means "no limit": storing nothing
                // silently would be a worse default than honouring every attachment.
                if (settings.attachmentMaxSize > 0 && attachment.content.byteLength > settings.attachmentMaxSize) {
                    console.error(
                        '[email] attachment.skip.oversize',
                        attachment.filename,
                        attachment.content.byteLength,
                    );
                    return null;
                }
                const attachmentId = crypto.randomUUID();
                const key = `attachments/${id}/${attachmentId}/${attachment.filename}`;
                try {
                    await bucket.put(key, attachment.content, {
                        httpMetadata: { contentType: attachment.mimetype },
                    });
                } catch (e) {
                    console.error('[email] attachment.store.failed', attachment.filename, (e as Error).message);
                    return null;
                }
                return {
                    id: attachmentId,
                    email_id: id,
                    filename: attachment.filename,
                    mimetype: attachment.mimetype,
                    size: attachment.content.byteLength,
                    content_id: attachment.contentId,
                    disposition: attachment.disposition,
                    r2_key: key,
                };
            }),
        );
        attachmentRecords.push(...stored.filter((record): record is AttachmentRecord => record !== null));
    }

    let bodyHtml = parsed.html;
    let bodyText: string | null = parsed.text;
    let bodyHtmlKey: string | null = null;
    let bodyTextKey: string | null = null;
    if (env.BUCKET) {
        if (bodyHtml && bodyHtml.length > BODY_INLINE_LIMIT) {
            bodyHtmlKey = `bodies/${id}/body.html`;
            await env.BUCKET.put(bodyHtmlKey, bodyHtml);
            bodyHtml = null;
        }
        if (bodyText && bodyText.length > BODY_INLINE_LIMIT) {
            bodyTextKey = `bodies/${id}/body.txt`;
            await env.BUCKET.put(bodyTextKey, bodyText);
            bodyText = null;
        }
    }

    await dao.insertEmail(
        {
            ...parsed,
            html: bodyHtml,
            text: bodyText ?? '',
        },
        {
            id,
            folder,
            size: rawSize,
            bodyHtmlKey,
            bodyTextKey,
            storedAttachments: attachmentRecords.length,
        },
    );
    await dao.insertAttachments(id, attachmentRecords);

    const stored = await dao.getEmail(id);
    if (!stored) {
        throw new Error('Failed to persist email');
    }
    return stored;
}

/** One delivered notification: which chat got it and the Telegram message id. */
export interface TelegramNotification {
    chatId: string;
    messageId: number;
}

export async function sendMailToTelegram(mail: EmailRecord, env: Environment): Promise<TelegramNotification[]> {
    const { TELEGRAM_TOKEN, TELEGRAM_ID } = env;
    const settings = await loadSettings(env);
    const hydrated = await hydrateEmail(mail, env.BUCKET);
    const api = createTelegramBotAPI(TELEGRAM_TOKEN);
    const chats = TELEGRAM_ID.split(',')
        .map(item => item.trim())
        .filter(Boolean);
    // Only numeric positive chat ids are private chats, which are the only
    // chats that accept a `web_app` button for the Open action. Group,
    // channel and @username destinations omit it rather than risk a send
    // failure with an unsupported button.
    const outcomes = await Promise.allSettled(
        chats.map(async (id): Promise<TelegramNotification> => {
            const req = await renderEmailListMode(hydrated, env, settings, {
                chatType: /^\d+$/.test(id) ? 'private' : 'group',
            });
            const msg = await api.sendMessageWithReturns({
                chat_id: id,
                ...req,
            });
            return { chatId: id, messageId: msg.result.message_id };
        }),
    );
    // One failing chat must not lose the message ids of the others.
    return outcomes
        .filter((outcome): outcome is PromiseFulfilledResult<TelegramNotification> => outcome.status === 'fulfilled')
        .map(outcome => outcome.value);
}

/**
 * Background half of a delivery. The email is already persisted when this
 * runs, so a slow or failing Telegram API is only logged — it can no longer
 * delay the mail or bounce it back to the sender.
 */
async function notifyTelegram(mail: EmailRecord, env: Environment, dao: Dao): Promise<void> {
    try {
        const notifications = await sendMailToTelegram(mail, env);
        await Promise.all(
            notifications.map(({ chatId, messageId }) => dao.saveTelegramMessage(messageId, chatId, mail.id)),
        );
    } catch (e) {
        console.error('[email] telegram.notify.failed', mail.id, (e as Error).message);
    }
}

export async function emailHandler(
    message: ForwardableEmailMessage,
    env: Environment,
    ctx: ExecutionContext,
): Promise<void> {
    const dao = new Dao(env.DB);
    const settings = await loadSettings(env);
    const isBlock = await isMessageBlock(message, env);

    // Reject the email. Done before identity resolution so a rejected message
    // without a `Message-ID` is not fully buffered just to be thrown away.
    if (isBlock && settings.blockPolicy.includes('reject')) {
        message.setReject('Blocked');
        return;
    }

    const identity = await resolveMessageIdentity(message);
    const id = identity.id;

    // Delivery journal keyed by the message identity plus the raw size. Email
    // Routing re-runs the worker when the handler throws, so the journal is what
    // turns a redelivery into a no-op instead of a duplicate forward, row or
    // notification. Without a `Message-ID` header the identity is a content
    // hash, which is stable across redeliveries of the same bytes; the size is
    // mixed in because a sender may reuse one Message-ID for distinct messages.
    const journalId = `${id}|${message.rawSize}`;
    const status = (await dao.getMailStatus(journalId)) ?? {
        message_id: journalId,
        telegram: 0,
        forwards: '[]',
        updated_at: '',
    };
    const forwarded = new Set(JSON.parse(status.forwards) as string[]);

    // Forward to email; one bad address only skips itself.
    const blockForward = isBlock && settings.blockPolicy.includes('forward');
    const forwardList = blockForward || !settings.forwardEnabled ? [] : settings.forwardList;
    for (const forward of forwardList) {
        const address = forward.trim();
        if (!address || forwarded.has(address)) {
            continue;
        }
        try {
            await message.forward(address);
            forwarded.add(address);
            await dao.upsertMailStatus(journalId, { telegram: Boolean(status.telegram), forwards: [...forwarded] });
        } catch (e) {
            console.error('[email] forward.failed', address, (e as Error).message);
        }
    }

    // Parse and persist. Persisting is the transaction boundary: a failure
    // here propagates so Email Routing retries delivery, while the journal
    // above and the Message-ID lookup keep that retry from duplicating work.
    //
    // Reaching here means the journal has telegram = 0, so no notification has
    // been recorded: an existing row with the same identity and size is a
    // redelivery from a crash between persist and journal write, and it must
    // still be notified. A same identity with a different size is a distinct
    // message and is stored as a new row. The residual window is the opposite
    // one: if the journal write succeeds but the background notify fails, the
    // notification is not retried (at-most-once for the push, at-least-once
    // for the stored mail).
    const blockTelegram = isBlock && settings.blockPolicy.includes('telegram');
    if (!status.telegram && !blockTelegram) {
        const parsed = await parseEmail(message, settings.maxEmailSize, settings.maxEmailSizePolicy, {
            messageId: id,
            rawBytes: identity.rawBytes ?? undefined,
        });
        const folder = isBlock ? 'spam' : 'inbox';
        const existing = await dao.getEmailByMessageId(parsed.messageId);
        let stored: EmailRecord;
        if (existing && existing.size === message.rawSize) {
            stored = existing;
            // A redelivery can arrive after the block policy changed; keep the
            // row's folder in step with how this delivery classified it.
            if (existing.folder !== folder) {
                await dao.updateEmailFlags(existing.id, { folder });
                stored = { ...existing, folder };
            }
        } else {
            stored = await persistEmail(env, dao, parsed, folder, message.rawSize, settings);
        }
        await dao.upsertMailStatus(journalId, { telegram: true, forwards: [...forwarded] });
        ctx.waitUntil(notifyTelegram(stored, env, dao));
    }
}
