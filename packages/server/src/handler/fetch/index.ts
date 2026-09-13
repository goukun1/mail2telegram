import type { IRequest, RouterType } from 'itty-router';
import type {
    AddressType,
    AiModelsRequest,
    AiModelsResponse,
    AuthLoginResponse,
    AuthResponse,
    EmailDetailResponse,
    EmailListResponse,
    Environment,
    Folder,
    MeResponse,
    RuntimeSettings,
    SettingsResponse,
    TelegramUser,
} from '../../types';
import { validate } from '@tma.js/init-data-node/web';
import { json, Router } from 'itty-router';
import { Dao } from '../../db';
import { purgeAttachments, purgeEmails, purgeEmailsByIds } from '../../db/cleanup';
import { importSettingsFromEnv, loadSettings, saveDiscoveredDomain, saveSettings } from '../../db/settings';
import { hydrateEmail, replyToEmail, summarizeEmail, testAddressAgainstLists } from '../../mail';
import { listOpenAiCompatibleModels, listWorkersAiTextModels } from '../../mail/summarization';
import { createTelegramBotAPI, telegramCommands, telegramWebhookHandler } from '../../telegram';

class HTTPError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

/** Lifetime of a browser session issued by `POST /api/auth/login`. */
const WEB_TOKEN_TTL_MS = 30 * 86400_000;

async function hmacHex(secret: string, message: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return [...new Uint8Array(mac)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Stateless browser session: `<expiry-ms>.<nonce>.<hmac>`. No server-side
 * storage, and rotating `WEB_PASSWORD` invalidates every issued token.
 */
async function issueWebToken(webPassword: string): Promise<AuthLoginResponse> {
    const expiryMs = Date.now() + WEB_TOKEN_TTL_MS;
    const nonce = crypto.randomUUID();
    const mac = await hmacHex(webPassword, `${expiryMs}.${nonce}`);
    return { token: `${expiryMs}.${nonce}.${mac}`, expiresAt: new Date(expiryMs).toISOString() };
}

async function verifyWebToken(webPassword: string, token: string): Promise<boolean> {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return false;
    }
    const [expiry, nonce, mac] = parts;
    const expiryMs = Number.parseInt(expiry, 10);
    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
        return false;
    }
    return timingSafeEqual(mac, await hmacHex(webPassword, `${expiry}.${nonce}`));
}

function createAuthMiddleware(env: Environment): (req: IRequest) => Promise<void> {
    const { TELEGRAM_TOKEN, TELEGRAM_ID } = env;
    const allowed = new Set(
        TELEGRAM_ID.split(',')
            .map(item => item.trim())
            .filter(Boolean),
    );
    // Browser sessions outside Telegram log in with this password once and then
    // present an issued token; an empty value keeps the Mini App as the only
    // way in.
    const webPassword = env.WEB_PASSWORD || '';
    return async (req: IRequest): Promise<void> => {
        // Split on the first space only: initData is URL-encoded, but token
        // values are opaque strings with their own structure.
        const header = req.headers.get('Authorization') || '';
        const splitAt = header.indexOf(' ');
        const authType = splitAt === -1 ? header : header.slice(0, splitAt);
        const authData = splitAt === -1 ? '' : header.slice(splitAt + 1);
        if (authType === 'tma') {
            if (!authData) {
                throw new HTTPError(401, 'Invalid authorization type');
            }
            try {
                await validate(authData, TELEGRAM_TOKEN, { expiresIn: 3600 });
            } catch (e) {
                throw new HTTPError(401, (e as Error).message);
            }
            const user = JSON.parse(new URLSearchParams(authData).get('user') || '{}') as TelegramUser;
            if (!allowed.has(`${user.id}`)) {
                throw new HTTPError(403, 'Permission denied');
            }
            (req as IRequest & { user?: TelegramUser }).user = user;
            return;
        }
        if (authType === 'web') {
            if (!webPassword) {
                throw new HTTPError(401, 'Password access is disabled');
            }
            if (!authData || !(await verifyWebToken(webPassword, authData))) {
                throw new HTTPError(401, 'Invalid web token');
            }
            (req as IRequest & { user?: TelegramUser }).user = { id: 0, first_name: 'Web' };
            return;
        }
        throw new HTTPError(401, 'Invalid authorization type');
    };
}

/**
 * Compares two strings without leaking their content through early exits.
 * Different lengths still return immediately; only the length is exposed.
 */
function timingSafeEqual(a: string, b: string): boolean {
    const left = new TextEncoder().encode(a);
    const right = new TextEncoder().encode(b);
    if (left.length !== right.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
        diff |= left[i] ^ right[i];
    }
    return diff === 0;
}

function errorHandler(error: Error): Response {
    const status = error instanceof HTTPError ? error.status : 500;
    return new Response(
        JSON.stringify({
            error: error.message,
        }),
        {
            status,
            headers: { 'content-type': 'application/json; charset=utf-8' },
        },
    );
}

function parseFolder(value: string | null | undefined): Folder | 'all' {
    const allowed: (Folder | 'all')[] = ['inbox', 'spam', 'trash', 'sent', 'all'];
    return allowed.includes(value as Folder) ? (value as Folder) : 'inbox';
}

const FOLDERS = new Set<Folder>(['inbox', 'spam', 'trash', 'sent']);

function parseAddressType(value: unknown): AddressType {
    if (value === 'block' || value === 'white') {
        return value;
    }
    throw new HTTPError(400, 'Invalid address type');
}

function requireEmail(env: Environment): string {
    if (!env.TELEGRAM_TOKEN) {
        throw new HTTPError(500, 'TELEGRAM_TOKEN is not configured');
    }
    return env.TELEGRAM_TOKEN;
}

/** `all` clears the whole mailbox, otherwise `days` sets the cutoff in the past. */
function parseCutoff(all: unknown, days: unknown): string | null {
    if (all === true || all === 'true') {
        return null;
    }
    const value = Number(days);
    if (!Number.isFinite(value) || value <= 0) {
        throw new HTTPError(400, 'Invalid cleanup range');
    }
    return new Date(Date.now() - value * 86400_000).toISOString();
}

function createRouter(env: Environment): RouterType {
    const router = Router({
        catch: errorHandler,
        finally: [json],
    });

    const { TELEGRAM_TOKEN, DOMAIN, DB, BUCKET } = env;
    const dao = new Dao(DB);
    const auth = createAuthMiddleware(env);

    // ------------------------------------------------------------ public

    router.get('/', async (): Promise<Response> => {
        return new Response(null, {
            status: 302,
            headers: { location: 'https://github.com/TBXark/mail2telegram' },
        });
    });

    // Tells the frontend whether the password login should be offered when the
    // app is opened outside Telegram. No secrets, just the capability flag.
    router.get('/api/auth', async (): Promise<AuthResponse> => {
        return { passwordEnabled: Boolean(env.WEB_PASSWORD) };
    });

    // Exchanges the web password for a stateless session token. The password
    // travels in the JSON body (any Unicode works) and is never stored by the
    // browser — later requests carry the issued token instead.
    router.post('/api/auth/login', async (req: IRequest): Promise<AuthLoginResponse> => {
        const webPassword = env.WEB_PASSWORD || '';
        if (!webPassword) {
            throw new HTTPError(401, 'Password access is disabled');
        }
        let password: unknown;
        try {
            ({ password } = (await req.json()) as { password?: unknown });
        } catch {
            throw new HTTPError(400, 'Invalid request body');
        }
        if (typeof password !== 'string' || !timingSafeEqual(password, webPassword)) {
            throw new HTTPError(401, 'Invalid password');
        }
        return await issueWebToken(webPassword);
    });

    router.get('/init', async (req: IRequest): Promise<any> => {
        requireEmail(env);
        const api = createTelegramBotAPI(TELEGRAM_TOKEN);
        // With no DOMAIN variable the host comes from this request (filled in
        // by the fetch entrypoint). Remember it so email notifications can
        // link back even though the email handler never sees a request. When
        // DOMAIN is set to a different host the variable wins and nothing is
        // stored.
        const host = new URL(req.url).host;
        if (DOMAIN === host) {
            await saveDiscoveredDomain(env, host);
        }
        const miniAppUrl = `https://${DOMAIN}/#/inbox`;
        const webhook = await api.setWebhook({
            url: `https://${DOMAIN}/telegram/${TELEGRAM_TOKEN}/webhook`,
        });
        const commands = await api.setMyCommands({ commands: telegramCommands });
        // Point the bot's menu button at the worker's Mini App so it opens without
        // needing the /start button.
        const menuButton = await api.setChatMenuButton({
            menu_button: {
                type: 'web_app',
                text: 'Open Mail',
                web_app: { url: miniAppUrl },
            },
        });
        return {
            webhook: await webhook.json(),
            commands: await commands.json(),
            menuButton: await menuButton.json(),
        };
    });

    // Legacy view endpoint kept for the Text/HTML buttons on notifications
    // sent by 1.0. Access control is the unguessable mail id, so the document
    // is forced into an opaque origin: `sandbox` (without allow-scripts) keeps
    // email HTML off the worker origin that hosts the authenticated API.
    router.get('/email/:id', async (req: IRequest): Promise<Response> => {
        const id = req.params.id;
        const mode = req.query.mode || 'text';
        const record = await dao.getEmail(id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        const mail = await hydrateEmail(record, BUCKET);
        const isHtml = mode === 'html';
        const text = (isHtml ? mail.body_html : mail.body_text) || '';
        return new Response(text, {
            headers: {
                'content-type': isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
                'content-security-policy': 'sandbox',
                'x-content-type-options': 'nosniff',
            },
        });
    });

    // --------------------------------------------------------------- auth

    router.get('/api/me', auth, async (req: IRequest): Promise<MeResponse> => {
        const user = (req as IRequest & { user?: TelegramUser }).user;
        return {
            user: user as TelegramUser,
            resendEnabled: Boolean(env.RESEND_API_KEY),
            settings: await loadSettings(env),
        };
    });

    // ------------------------------------------------------------- emails

    router.get('/api/emails', auth, async (req: IRequest): Promise<EmailListResponse> => {
        const { folder, q, starred, unread, limit, offset } = req.query;
        const result = await dao.listEmails({
            folder: parseFolder(folder as string),
            query: (q as string) || undefined,
            starred: starred === 'true' ? true : starred === 'false' ? false : undefined,
            unread: unread === 'true' ? true : unread === 'false' ? false : undefined,
            limit: limit ? Number.parseInt(limit as string, 10) : undefined,
            offset: offset ? Number.parseInt(offset as string, 10) : undefined,
        });
        return {
            emails: result.emails,
            total: result.total,
            // The UI only shows the inbox, so the badge ignores mail parked in
            // internal folders (blocked senders, sent replies).
            unread: await dao.countUnread('inbox'),
        };
    });

    router.get('/api/emails/:id', auth, async (req: IRequest): Promise<EmailDetailResponse> => {
        const record = await dao.getEmail(req.params.id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        const attachments = await dao.getAttachments(record.id);
        const mail = await hydrateEmail(record, BUCKET);
        return {
            email: mail,
            attachments: attachments.map(({ r2_key: _r2Key, ...att }) => att),
            resendEnabled: Boolean(env.RESEND_API_KEY),
            summaryEnabled: (await loadSettings(env)).summaryEnabled,
        };
    });

    router.patch('/api/emails/:id', auth, async (req: IRequest): Promise<any> => {
        const body = (await req.json()) as { isRead?: boolean; isStarred?: boolean; folder?: Folder };
        if (body.folder !== undefined && !FOLDERS.has(body.folder)) {
            throw new HTTPError(400, 'Invalid folder');
        }
        const record = await dao.getEmail(req.params.id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        await dao.updateEmailFlags(record.id, {
            isRead: body.isRead,
            isStarred: body.isStarred,
            folder: body.folder,
        });
        return { email: await dao.getEmail(record.id) };
    });

    router.delete('/api/emails/:id', auth, async (req: IRequest): Promise<any> => {
        const record = await dao.getEmail(req.params.id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        // Deletion is permanent: the row, its attachments and stored bodies
        // (including their R2 objects) are all freed at once.
        await purgeEmailsByIds(dao, BUCKET, [record]);
        return { success: true };
    });

    // ------------------------------------------------------- mail cleanup

    router.get('/api/emails/cleanup/preview', auth, async (req: IRequest): Promise<any> => {
        const { all, days } = req.query;
        const cutoff = parseCutoff(all, days);
        return {
            emails: await dao.countCleanupTargets(cutoff),
            attachments: await dao.countAttachmentsBefore(cutoff),
        };
    });

    router.post('/api/emails/cleanup', auth, async (req: IRequest): Promise<any> => {
        const body = (await req.json()) as { days?: number; all?: boolean; attachmentsOnly?: boolean };
        const cutoff = parseCutoff(body.all, body.days);
        return body.attachmentsOnly
            ? await purgeAttachments(dao, BUCKET, cutoff)
            : await purgeEmails(dao, BUCKET, cutoff);
    });

    router.post('/api/emails/:id/summary', auth, async (req: IRequest): Promise<any> => {
        const record = await dao.getEmail(req.params.id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        const settings = await loadSettings(env);
        const summary = await summarizeEmail(await hydrateEmail(record, BUCKET), env, settings);
        return { summary };
    });

    router.post('/api/emails/:id/reply', auth, async (req: IRequest): Promise<any> => {
        if (!env.RESEND_API_KEY) {
            throw new HTTPError(400, 'Resend API is not enabled');
        }
        const body = (await req.json()) as { text?: string };
        if (!body.text?.trim()) {
            throw new HTTPError(400, 'Reply text is required');
        }
        const record = await dao.getEmail(req.params.id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        await replyToEmail(env.RESEND_API_KEY, record, body.text);
        try {
            await dao.recordSentReply(record, body.text);
        } catch (e) {
            // The reply itself went out; only the Sent-folder copy failed.
            console.error('[reply] record.failed', (e as Error).message);
        }
        return { success: true };
    });

    router.get('/api/emails/:id/attachments/:aid', auth, async (req: IRequest): Promise<Response> => {
        const attachment = await dao.getAttachment(req.params.aid);
        if (!attachment || attachment.email_id !== req.params.id) {
            throw new HTTPError(404, 'Attachment not found');
        }
        if (!BUCKET) {
            throw new HTTPError(404, 'Attachment storage is not configured');
        }
        const object = await BUCKET.get(attachment.r2_key);
        if (!object) {
            throw new HTTPError(404, 'Attachment not found');
        }
        return new Response(object.body as unknown as ReadableStream, {
            headers: {
                'content-type': attachment.mimetype,
                'content-disposition': `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
            },
        });
    });

    // ---------------------------------------------------------- addresses

    router.get('/api/addresses', auth, async (req: IRequest): Promise<any> => {
        const type = req.query.type ? parseAddressType(req.query.type) : undefined;
        return { addresses: await dao.listAddresses(type) };
    });

    router.post('/api/addresses', auth, async (req: IRequest): Promise<any> => {
        const body = (await req.json()) as { address?: string; type?: unknown; note?: string };
        if (!body.address?.trim()) {
            throw new HTTPError(400, 'Address is required');
        }
        const type = parseAddressType(body.type);
        const record = await dao.addAddress(body.address.trim(), type, body.note);
        return { address: record };
    });

    router.delete('/api/addresses/:id', auth, async (req: IRequest): Promise<any> => {
        await dao.removeAddress(req.params.id);
        return { success: true };
    });

    router.post('/api/addresses/test', auth, async (req: IRequest): Promise<any> => {
        const body = (await req.json()) as { address?: string };
        if (!body.address?.trim()) {
            throw new HTTPError(400, 'Address is required');
        }
        return await testAddressAgainstLists(body.address.trim(), env);
    });

    // ----------------------------------------------------------- settings

    router.get('/api/settings', auth, async (): Promise<SettingsResponse> => {
        return { settings: await loadSettings(env), workersAiAvailable: Boolean(env.AI) };
    });

    router.put('/api/settings', auth, async (req: IRequest): Promise<SettingsResponse> => {
        const patch = (await req.json()) as Partial<RuntimeSettings>;
        await saveSettings(dao, patch);
        return { settings: await loadSettings(env), workersAiAvailable: Boolean(env.AI) };
    });

    // Model ids for the settings model picker. The worker proxies the
    // OpenAI-compatible call so the browser never talks to the provider
    // directly (CORS) and the stored token can be reused when the field is
    // left empty.
    router.post('/api/settings/ai/models', auth, async (req: IRequest): Promise<AiModelsResponse> => {
        let body: AiModelsRequest;
        try {
            body = (await req.json()) as AiModelsRequest;
        } catch {
            throw new HTTPError(400, 'Invalid request body');
        }
        if (body.provider === 'workers-ai') {
            if (!env.AI) {
                throw new HTTPError(400, 'Workers AI binding is not configured');
            }
            return { models: await listWorkersAiTextModels(env.AI) };
        }
        if (body.provider === 'openai') {
            const settings = await loadSettings(env);
            const baseUrl = body.baseUrl?.trim() || settings.openaiBaseUrl;
            const apiKey = body.apiKey?.trim() || settings.openaiApiKey;
            if (!baseUrl || !apiKey) {
                throw new HTTPError(400, 'Base URL and API token are required');
            }
            return { models: await listOpenAiCompatibleModels(baseUrl, apiKey) };
        }
        throw new HTTPError(400, 'Invalid provider');
    });

    // Copies the env-derived defaults and address lists into D1 so settings can
    // be managed entirely from the Mini App.
    router.post('/api/settings/import', auth, async (): Promise<any> => {
        return await importSettingsFromEnv(dao, env);
    });

    // ------------------------------------------------------------ webhook

    router.post('/telegram/:token/webhook', async (req: IRequest): Promise<any> => {
        if (req.params.token !== TELEGRAM_TOKEN) {
            throw new HTTPError(403, 'Invalid token');
        }
        try {
            await telegramWebhookHandler(req, env);
        } catch (e) {
            console.error('[telegram] webhook.error', (e as Error).message);
        }
        return { success: true };
    });

    router.all('*', async () => {
        throw new HTTPError(404, 'Not found');
    });

    return router;
}

export async function fetchHandler(request: Request, env: Environment): Promise<Response> {
    // Every fetch-context consumer builds webhook / Mini App links from
    // `DOMAIN`. When the variable is not configured, the host of the incoming
    // request is the worker's own address, so use it for this request; `/init`
    // additionally remembers it in D1 for the request-less email handler.
    if (!env.DOMAIN) {
        env.DOMAIN = new URL(request.url).host;
    }
    const router = createRouter(env);
    return router.fetch(request).catch(e => {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    });
}
