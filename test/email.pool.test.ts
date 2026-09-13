import type { Environment } from '../src/types';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Dao } from '../src/db';
import { emailHandler } from '../src/handler/email';
import { buildEmail, mockTelegramFetch, resetStorage, testEnv } from './helpers';

const db = (env as unknown as { DB: Environment['DB'] }).DB;

let telegram: ReturnType<typeof mockTelegramFetch>;
beforeEach(async () => {
    await resetStorage();
    telegram = mockTelegramFetch();
});
afterEach(() => telegram.restore());

async function rowCount(): Promise<number> {
    const row = await db.prepare('SELECT COUNT(*) AS total FROM emails').first<{ total: number }>();
    return row?.total ?? 0;
}

async function deliver(built: ReturnType<typeof buildEmail>, configuration: Environment = testEnv()): Promise<void> {
    const ctx = createExecutionContext();
    await emailHandler(built.message, configuration, ctx);
    await waitOnExecutionContext(ctx);
}

const ATTACHMENT_MIME = [
    '--sep',
    'Content-Type: text/plain',
    '',
    'body',
    '--sep',
    'Content-Type: application/octet-stream; name="file.txt"',
    'Content-Disposition: attachment; filename="file.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    'aGVsbG8=',
    '--sep--',
].join('\r\n');

const MIME_HEADERS = {
    'MIME-Version': '1.0',
    'Content-Type': 'multipart/mixed; boundary="sep"',
};

describe('delivery journal identity', () => {
    it('collapses a redelivery of the same Message-ID into one row and one push', async () => {
        await deliver(buildEmail({ messageId: '<same@test>', body: 'hello' }));
        await deliver(buildEmail({ messageId: '<same@test>', body: 'hello' }));

        expect(await rowCount()).toBe(1);
        expect(telegram.calls).toBe(1);
    });

    it('stores distinct messages that reuse one Message-ID with a different size', async () => {
        await deliver(buildEmail({ messageId: '<reused@test>', body: 'short' }));
        await deliver(buildEmail({ messageId: '<reused@test>', body: 'a much longer body' }));

        expect(await rowCount()).toBe(2);
        expect(telegram.calls).toBe(2);
    });

    // Regression for the no-Message-ID path: a random fallback id made every
    // redelivery a brand-new message.
    it('keys follow-up mail by the resolved identity, not a fresh random id', async () => {
        await deliver(buildEmail({ body: 'no header here' }));
        // Same bytes delivered again: the content-hash identity makes the second
        // delivery resolve to the same journal entry and stored row.
        await deliver(buildEmail({ body: 'no header here' }));

        expect(await rowCount()).toBe(1);
        expect(telegram.calls).toBe(1);
    });

    it('reclassifies an existing row when a redelivery is no longer blocked', async () => {
        // A block policy without `reject`/`telegram` still persists the mail, as
        // spam. Simulate the crash window so the redelivery reuses the row.
        const blocked = testEnv({ BLOCK_POLICY: 'forward' });
        await new Dao(db).addAddress('sender@example.com', 'block');
        await deliver(buildEmail({ messageId: '<blocked@test>', body: 'same bytes' }), blocked);

        const before = await db.prepare('SELECT folder FROM emails').first<{ folder: string }>();
        expect(before?.folder).toBe('spam');

        await db.prepare('DELETE FROM mail_status').run();
        await new Dao(db).removeAddressByValue('sender@example.com', 'block');
        await deliver(buildEmail({ messageId: '<blocked@test>', body: 'same bytes' }));

        const after = await db.prepare('SELECT folder FROM emails').first<{ folder: string }>();
        expect(after?.folder).toBe('inbox');
        expect(await rowCount()).toBe(1);
    });
});

describe('attachment size limit', () => {
    it('skips an oversized attachment when the limit is positive', async () => {
        const built = buildEmail({
            messageId: '<att-skip@test>',
            extraHeaders: MIME_HEADERS,
            rawBody: ATTACHMENT_MIME,
        });
        await deliver(built, testEnv({ ATTACHMENT_MAX_SIZE: '1' }));
        expect(await attachmentCount()).toBe(0);
    });

    it('treats a limit of zero as unlimited', async () => {
        const built = buildEmail({
            messageId: '<att-zero@test>',
            extraHeaders: MIME_HEADERS,
            rawBody: ATTACHMENT_MIME,
        });
        await deliver(built, testEnv({ ATTACHMENT_MAX_SIZE: '0' }));
        expect(await attachmentCount()).toBe(1);
    });
});

describe('block policy', () => {
    it('rejects without storing when the policy is reject', async () => {
        await new Dao(db).addAddress('sender@example.com', 'block');
        const built = buildEmail({ body: 'blocked, no header' });
        await deliver(built, testEnv({ BLOCK_POLICY: 'reject' }));

        expect(built.rejected).toEqual(['Blocked']);
        expect(await rowCount()).toBe(0);
        expect(telegram.calls).toBe(0);
    });
});

async function attachmentCount(): Promise<number> {
    const row = await db.prepare('SELECT COUNT(*) AS total FROM attachments').first<{ total: number }>();
    return row?.total ?? 0;
}
