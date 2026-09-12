import type { IRequest, RouterType } from 'itty-router';
import type { AddressType, Environment, Folder, RuntimeSettings } from '../../types';
import { validate } from '@tma.js/init-data-node/web';
import { json, Router } from 'itty-router';
import { Dao } from '../../db';
import { loadSettings, saveSettings } from '../../db/settings';
import { hydrateEmail, replyToEmail, testAddressAgainstLists, summarizeEmail } from '../../mail';
import { createTelegramBotAPI, telegramCommands, telegramWebhookHandler } from '../../telegram';

class HTTPError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

interface TMAUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
}

function createTmaAuthMiddleware(env: Environment): (req: IRequest) => Promise<void> {
    const { TELEGRAM_TOKEN, TELEGRAM_ID } = env;
    return async (req: IRequest): Promise<void> => {
        const [authType, authData = ''] = (req.headers.get('Authorization') || '').split(' ');
        if (authType !== 'tma' || !authData) {
            throw new HTTPError(401, 'Invalid authorization type');
        }
        try {
            await validate(authData, TELEGRAM_TOKEN, { expiresIn: 3600 });
        } catch (e) {
            throw new HTTPError(401, (e as Error).message);
        }
        const user = JSON.parse(new URLSearchParams(authData).get('user') || '{}') as TMAUser;
        const allowed = TELEGRAM_ID.split(',').map(item => item.trim()).filter(Boolean);
        if (!allowed.includes(`${user.id}`)) {
            throw new HTTPError(403, 'Permission denied');
        }
        (req as IRequest & { user?: TMAUser }).user = user;
    };
}

function errorHandler(error: Error): Response {
    const status = error instanceof HTTPError ? error.status : 500;
    return new Response(JSON.stringify({
        error: error.message,
    }), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}

function parseFolder(value: string | null | undefined): Folder | 'all' {
    const allowed: (Folder | 'all')[] = ['inbox', 'spam', 'trash', 'sent', 'all'];
    return allowed.includes(value as Folder) ? (value as Folder) : 'inbox';
}

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

function createRouter(env: Environment): RouterType {
    const router = Router({
        catch: errorHandler,
        finally: [json],
    });

    const { TELEGRAM_TOKEN, DOMAIN, DB, BUCKET } = env;
    const dao = new Dao(DB);
    const auth = createTmaAuthMiddleware(env);

    // ------------------------------------------------------------ public

    router.get('/', async (): Promise<Response> => {
        return new Response(null, {
            status: 302,
            headers: { location: 'https://github.com/TBXark/mail2telegram' },
        });
    });

    router.get('/init', async (): Promise<any> => {
        requireEmail(env);
        const api = createTelegramBotAPI(TELEGRAM_TOKEN);
        const webhook = await api.setWebhook({
            url: `https://${DOMAIN}/telegram/${TELEGRAM_TOKEN}/webhook`,
        });
        const commands = await api.setMyCommands({ commands: telegramCommands });
        return {
            webhook: await webhook.json(),
            commands: await commands.json(),
        };
    });

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
            },
        });
    });

    // --------------------------------------------------------------- auth

    router.get('/api/me', auth, async (req: IRequest): Promise<any> => {
        const user = (req as IRequest & { user?: TMAUser }).user;
        return {
            user,
            resendEnabled: Boolean(env.RESEND_API_KEY),
            settings: await loadSettings(env),
        };
    });

    // ------------------------------------------------------------- emails

    router.get('/api/emails', auth, async (req: IRequest): Promise<any> => {
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
            unread: await dao.countUnread('all'),
        };
    });

    router.get('/api/emails/:id', auth, async (req: IRequest): Promise<any> => {
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
        const body = await req.json() as { isRead?: boolean; isStarred?: boolean; folder?: Folder };
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
        if (record.folder === 'trash') {
            await dao.deleteEmail(record.id);
        } else {
            await dao.updateEmailFlags(record.id, { folder: 'trash' });
        }
        return { success: true };
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
        const body = await req.json() as { text?: string };
        if (!body.text?.trim()) {
            throw new HTTPError(400, 'Reply text is required');
        }
        const record = await dao.getEmail(req.params.id);
        if (!record) {
            throw new HTTPError(404, 'Email not found');
        }
        await replyToEmail(env.RESEND_API_KEY, record, body.text);
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
        const body = await req.json() as { address?: string; type?: unknown; note?: string };
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
        const body = await req.json() as { address?: string };
        if (!body.address?.trim()) {
            throw new HTTPError(400, 'Address is required');
        }
        return await testAddressAgainstLists(body.address.trim(), env);
    });

    // ----------------------------------------------------------- settings

    router.get('/api/settings', auth, async (): Promise<any> => {
        return { settings: await loadSettings(env) };
    });

    router.put('/api/settings', auth, async (req: IRequest): Promise<any> => {
        const patch = await req.json() as Partial<RuntimeSettings>;
        await saveSettings(dao, patch);
        return { settings: await loadSettings(env) };
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
    const router = createRouter(env);
    return router.fetch(request).catch((e) => {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
    });
}
