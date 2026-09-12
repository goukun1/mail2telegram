import type * as Telegram from 'telegram-bot-api-types';
import type { EmailRecord, Environment, RuntimeSettings } from '../types';
import { checkAddressStatus } from './check';
import { summarizedByOpenAI, summarizedByWorkerAI } from './summarization';

export interface EmailDetailParams {
    text: string;
    reply_markup: Telegram.InlineKeyboardMarkup;
    link_preview_options: Telegram.LinkPreviewOptions;
}

export type EmailRender = (mail: EmailRecord, env: Environment, settings: RuntimeSettings) => Promise<EmailDetailParams>;

function sendableText(mail: EmailRecord): string {
    const body = mail.body_text || (mail.body_html ? '' : '');
    return body;
}

export async function renderEmailListMode(mail: EmailRecord, env: Environment, settings: RuntimeSettings): Promise<EmailDetailParams> {
    const {
        DEBUG,
        AI,
        OPENAI_API_KEY,
        DOMAIN,
    } = env;
    const text = `${mail.subject}\n\n-----------\nFrom\t:\t${mail.sender}\nTo\t\t:\t${mail.recipient}`;
    const keyboard: Telegram.InlineKeyboardButton[] = [
        {
            text: 'Preview',
            callback_data: `p:${mail.id}`,
        },
    ];
    if (settings.summaryEnabled && ((AI && settings.workersAiModel) || OPENAI_API_KEY)) {
        keyboard.push({
            text: 'Summary',
            callback_data: `s:${mail.id}`,
        });
    }
    if (mail.body_text) {
        keyboard.push({
            text: 'Text',
            url: `https://${DOMAIN}/email/${mail.id}?mode=text`,
        });
    }
    if (mail.body_html) {
        keyboard.push({
            text: 'HTML',
            url: `https://${DOMAIN}/email/${mail.id}?mode=html`,
        });
    }
    if (DEBUG === 'true') {
        keyboard.push({
            text: 'Debug',
            callback_data: `d:${mail.id}`,
        });
    }
    return {
        text,
        reply_markup: {
            inline_keyboard: [keyboard],
        },
        link_preview_options: {
            is_disabled: true,
        },
    };
}

function renderEmailDetail(text: string | undefined | null, id: string): EmailDetailParams {
    return {
        text: text || 'No content',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: 'Back',
                        callback_data: `l:${id}`,
                    },
                    {
                        text: 'Delete',
                        callback_data: 'delete',
                    },
                ],
            ],
        },
        link_preview_options: {
            is_disabled: true,
        },
    };
}

// eslint-disable-next-line unused-imports/no-unused-vars
export async function renderEmailPreviewMode(mail: EmailRecord, env: Environment, settings: RuntimeSettings): Promise<EmailDetailParams> {
    return renderEmailDetail(sendableText(mail).substring(0, 4096), mail.id);
}

export async function renderEmailSummaryMode(mail: EmailRecord, env: Environment, settings: RuntimeSettings): Promise<EmailDetailParams> {
    const { AI, OPENAI_API_KEY } = env;
    const req = renderEmailDetail('', mail.id);
    const prompt = `Summarize the following text in approximately 50 words with ${settings.summaryTargetLang}\n\n${sendableText(mail)}`;

    try {
        if (AI && settings.workersAiModel) {
            req.text = await summarizedByWorkerAI(AI, settings.workersAiModel, prompt);
        } else if (OPENAI_API_KEY) {
            req.text = await summarizedByOpenAI(OPENAI_API_KEY, settings.openaiCompletionsApi, settings.openaiChatModel, prompt);
        } else {
            req.text = 'Sorry, no summarization provider is configured.';
        }
    } catch (e) {
        req.text = `Failed to summarize the email: ${(e as Error).message}`;
    }
    return req;
}

export async function renderEmailDebugMode(mail: EmailRecord, env: Environment, settings: RuntimeSettings): Promise<EmailDetailParams> {
    const res = await checkAddressStatus([mail.sender, mail.recipient], env);
    const obj = {
        id: mail.id,
        messageId: mail.message_id,
        folder: mail.folder,
        subject: mail.subject,
        from: mail.sender,
        to: mail.recipient,
        date: mail.date,
        size: mail.size,
        settings,
        block: res,
    };
    const text = JSON.stringify(obj, null, 2);
    return renderEmailDetail(text, mail.id);
}
