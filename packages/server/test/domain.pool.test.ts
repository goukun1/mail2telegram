import type { Environment } from '../src/types';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTING_KEYS, loadDiscoveredDomain } from '../src/db/settings';
import { emailHandler } from '../src/handler/email';
import { fetchHandler } from '../src/handler/fetch';
import { buildEmail, mockTelegramFetch, resetStorage, testEnv } from './helpers';

const db = (env as unknown as { DB: Environment['DB'] }).DB;

let telegram: ReturnType<typeof mockTelegramFetch>;
beforeEach(async () => {
    await resetStorage();
    telegram = mockTelegramFetch();
});
afterEach(() => telegram.restore());

describe('domain discovery', () => {
    it('remembers the /init request host when DOMAIN is not configured', async () => {
        const configuration = testEnv({ DOMAIN: '' });
        const response = await fetchHandler(new Request('https://discovered.example/init'), configuration);
        expect(response.status).toBe(200);

        expect(await loadDiscoveredDomain(configuration)).toBe('discovered.example');
    });

    it('keeps the DOMAIN variable instead of storing the request host', async () => {
        const configuration = testEnv({ DOMAIN: 'configured.example' });
        await fetchHandler(new Request('https://other.example/init'), configuration);

        expect(await loadDiscoveredDomain(configuration)).toBeNull();
    });

    it('delivers notifications with the remembered host when DOMAIN is unset', async () => {
        const configuration = testEnv({ DOMAIN: '' });
        await fetchHandler(new Request('https://discovered.example/init'), configuration);

        const ctx = createExecutionContext();
        await emailHandler(buildEmail({ messageId: '<link@test>' }).message, configuration, ctx);
        await waitOnExecutionContext(ctx);

        // Three of the calls are the /init registrations; the push is the one
        // carrying the Mini App link.
        expect(telegram.bodies.some(body => body.includes('https://discovered.example/#/mail/'))).toBe(true);
    });

    it('omits the Mini App button when no host is known at all', async () => {
        const configuration = testEnv({ DOMAIN: '' });
        const ctx = createExecutionContext();
        await emailHandler(buildEmail({ messageId: '<nolink@test>' }).message, configuration, ctx);
        await waitOnExecutionContext(ctx);

        // The notification is still delivered, just without a web_app button.
        expect(telegram.calls).toBe(1);
        expect(telegram.bodies[0]).not.toContain('web_app');
    });

    it('keeps the remembered host stable across repeated /init calls', async () => {
        const configuration = testEnv({ DOMAIN: '' });
        await fetchHandler(new Request('https://discovered.example/init'), configuration);
        await fetchHandler(new Request('https://discovered.example/init'), configuration);

        const row = await db
            .prepare('SELECT value FROM settings WHERE key = ?')
            .bind(SETTING_KEYS.workerDomain)
            .first<{ value: string }>();
        expect(row?.value).toBe('discovered.example');
    });
});
