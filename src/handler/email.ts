import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { AttachmentRecord, EmailRecord, Environment, ParsedEmailResult } from '../types';
import { Dao } from '../db';
import { loadSettings } from '../db/settings';
import { hydrateEmail, isMessageBlock, parseEmail, renderEmailListMode } from '../mail';
import { createTelegramBotAPI } from '../telegram';

const BODY_INLINE_LIMIT = 900 * 1024;

export interface PersistResult {
    email: EmailRecord;
    folder: 'inbox' | 'spam';
}

async function persistEmail(
    env: Environment,
    dao: Dao,
    parsed: ParsedEmailResult,
    folder: 'inbox' | 'spam',
    rawSize: number,
    truncated: boolean,
): Promise<EmailRecord> {
    const id = crypto.randomUUID();
    const attachmentRecords: AttachmentRecord[] = [];

    if (env.BUCKET) {
        for (const attachment of parsed.attachments) {
            const attachmentId = crypto.randomUUID();
            const key = `attachments/${id}/${attachmentId}/${attachment.filename}`;
            try {
                await env.BUCKET.put(key, attachment.content, {
                    httpMetadata: { contentType: attachment.mimetype },
                });
                attachmentRecords.push({
                    id: attachmentId,
                    email_id: id,
                    filename: attachment.filename,
                    mimetype: attachment.mimetype,
                    size: attachment.content.byteLength,
                    content_id: attachment.contentId,
                    disposition: attachment.disposition,
                    r2_key: key,
                });
            } catch (e) {
                console.error('[email] attachment.store.failed', attachment.filename, (e as Error).message);
            }
        }
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
            text: truncated && bodyText ? bodyText : (bodyText ?? ''),
        },
        {
            id,
            folder,
            size: rawSize,
            bodyHtmlKey,
            bodyTextKey,
        },
    );
    await dao.insertAttachments(id, attachmentRecords);

    const stored = await dao.getEmail(id);
    if (!stored) {
        throw new Error('Failed to persist email');
    }
    return stored;
}

export async function sendMailToTelegram(mail: EmailRecord, env: Environment): Promise<number[]> {
    const { TELEGRAM_TOKEN, TELEGRAM_ID } = env;
    const settings = await loadSettings(env);
    const req = await renderEmailListMode(await hydrateEmail(mail, env.BUCKET), env, settings);
    const api = createTelegramBotAPI(TELEGRAM_TOKEN);
    const messageIds: number[] = [];
    for (const id of TELEGRAM_ID.split(',').map(item => item.trim()).filter(Boolean)) {
        const msg = await api.sendMessageWithReturns({
            chat_id: id,
            ...req,
        });
        messageIds.push(msg.result.message_id);
    }
    return messageIds;
}

export async function emailHandler(message: ForwardableEmailMessage, env: Environment): Promise<void> {
    const dao = new Dao(env.DB);
    const id = message.headers.get('Message-ID')?.trim() || crypto.randomUUID();
    const isBlock = await isMessageBlock(message, env);
    const settings = await loadSettings(env);
    const isGuardian = settings.guardianMode;
    const status = isGuardian
        ? (await dao.getMailStatus(id)) ?? { message_id: id, telegram: 0, forwards: '[]', updated_at: '' }
        : null;
    const forwarded = new Set<string>(status ? JSON.parse(status.forwards) as string[] : []);

    // Reject the email
    if (isBlock && settings.blockPolicy.includes('reject')) {
        message.setReject('Blocked');
        return;
    }

    // Forward to email
    try {
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
                if (isGuardian && status) {
                    await dao.upsertMailStatus(id, { telegram: Boolean(status.telegram), forwards: [...forwarded] });
                }
            } catch (e) {
                console.error('[email] forward.failed', address, (e as Error).message);
            }
        }
    } catch (e) {
        console.error('[email] forward.error', (e as Error).message);
    }

    // Parse, persist and push to Telegram
    try {
        const blockTelegram = isBlock && settings.blockPolicy.includes('telegram');
        const alreadySent = Boolean(status?.telegram);
        if (!alreadySent && !blockTelegram) {
            const parsed = await parseEmail(message, settings.maxEmailSize, settings.maxEmailSizePolicy);
            const folder = isBlock ? 'spam' : 'inbox';
            const stored = await persistEmail(env, dao, parsed, folder, message.rawSize, parsed.truncated);
            const messageIds = await sendMailToTelegram(stored, env);
            for (const messageId of messageIds) {
                await dao.saveTelegramMessage(messageId, stored.id);
            }
        }
        if (isGuardian && status) {
            await dao.upsertMailStatus(id, { telegram: true, forwards: [...forwarded] });
        }
    } catch (e) {
        console.error('[email] telegram.error', (e as Error).message);
    }
}
