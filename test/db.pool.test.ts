import type { Environment, ParsedEmail } from '../src/types';
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { Dao } from '../src/db';
import { purgeEmailsByIds } from '../src/db/cleanup';
import { resetStorage } from './helpers';

const db = (env as unknown as { DB: Environment['DB'] }).DB;

beforeEach(resetStorage);

function parsedEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
    return {
        messageId: 'msg-1@test',
        from: 'sender@example.com',
        fromName: null,
        to: 'inbox@example.com',
        cc: null,
        bcc: null,
        subject: 'Hello',
        text: 'body',
        html: null,
        inReplyTo: null,
        references: [],
        date: new Date().toISOString(),
        rawHeaders: null,
        attachments: [],
        ...overrides,
    };
}

/** Insert a mail row and return its id. */
async function seedEmail(
    dao: Dao,
    overrides: { id?: string; messageId?: string; size?: number } = {},
): Promise<{ id: string; size: number }> {
    const id = overrides.id ?? crypto.randomUUID();
    const size = overrides.size ?? 42;
    await dao.insertEmail(parsedEmail({ messageId: overrides.messageId ?? 'msg-1@test' }), {
        id,
        folder: 'inbox',
        size,
    });
    return { id, size };
}

describe('telegram message mapping', () => {
    it('keys per chat, so one chat cannot overwrite another', async () => {
        const dao = new Dao(db);
        await dao.saveTelegramMessage(100, 5, 'mail-a');
        await dao.saveTelegramMessage(100, 6, 'mail-b');

        expect(await dao.getEmailIdByTelegramMessage(5, 100)).toBe('mail-a');
        expect(await dao.getEmailIdByTelegramMessage(6, 100)).toBe('mail-b');
        // A chat that never received message 100 resolves nothing.
        expect(await dao.getEmailIdByTelegramMessage(7, 100)).toBeNull();
    });

    it('re-points a mapping when the same chat reuses a message id', async () => {
        const dao = new Dao(db);
        await dao.saveTelegramMessage(200, 5, 'mail-a');
        await dao.saveTelegramMessage(200, 5, 'mail-b');
        expect(await dao.getEmailIdByTelegramMessage(5, 200)).toBe('mail-b');
    });
});

describe('claimFirstStart', () => {
    it('reports the first /start once, then remembers the chat', async () => {
        const dao = new Dao(db);
        expect(await dao.claimFirstStart(42)).toBe(true);
        expect(await dao.claimFirstStart(42)).toBe(false);
        // The marker is per chat, so another chat is still a first run.
        expect(await dao.claimFirstStart(43)).toBe(true);
    });
});

describe('purgeEmailsByIds', () => {
    it('removes the mail-status journal and chat mappings with the mail', async () => {
        const dao = new Dao(db);
        const { id, size } = await seedEmail(dao, { messageId: 'purge@test', size: 128 });
        await dao.saveTelegramMessage(300, 5, id);
        await dao.upsertMailStatus(`purge@test|${size}`, { telegram: true, forwards: [] });

        expect(await count('mail_status')).toBe(1);
        expect(await count('telegram_messages')).toBe(1);

        await purgeEmailsByIds(dao, undefined, [
            {
                id,
                message_id: 'purge@test',
                size,
                raw_key: null,
                body_html: null,
                body_text: null,
            },
        ]);

        expect(await count('emails')).toBe(0);
        expect(await count('mail_status')).toBe(0);
        expect(await count('telegram_messages')).toBe(0);
    });

    it('never treats starred mail as a cleanup target', async () => {
        const dao = new Dao(db);
        const starred = await seedEmail(dao, { id: 'starred-id', messageId: 'star@test' });
        await dao.updateEmailFlags(starred.id, { isStarred: true });
        const plain = await seedEmail(dao, { id: 'plain-id', messageId: 'plain@test' });

        const targets = await dao.findCleanupTargets(null, 100);
        const ids = targets.map(target => target.id);
        expect(ids).toContain(plain.id);
        expect(ids).not.toContain(starred.id);
        expect(await dao.countCleanupTargets(null)).toBe(1);
    });
});

async function count(table: string): Promise<number> {
    const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>();
    return row?.total ?? 0;
}
