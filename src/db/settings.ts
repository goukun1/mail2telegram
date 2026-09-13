import type { BlockPolicy, Environment, MaxEmailSizePolicy, RuntimeSettings } from '../types';
import { Dao, loadArrayFromRaw } from './index';

export const SETTING_KEYS = {
    autoCleanupDays: 'auto_cleanup_days',
    attachmentSaveEnabled: 'attachment_save_enabled',
    attachmentMaxSize: 'attachment_max_size',
    blockPolicy: 'block_policy',
    forwardList: 'forward_list',
    maxEmailSize: 'max_email_size',
    maxEmailSizePolicy: 'max_email_size_policy',
    summaryEnabled: 'summary_enabled',
    openaiApiKey: 'openai_api_key',
    workersAiModel: 'workers_ai_model',
    openaiChatModel: 'openai_chat_model',
    openaiCompletionsApi: 'openai_completions_api',
    summaryTargetLang: 'summary_target_lang',
    forwardEnabled: 'forward_enabled',
} as const;

function toBool(value: string | undefined, fallback = false): boolean {
    if (value === undefined || value === '') {
        return fallback;
    }
    return value === 'true';
}

function toInt(value: string | undefined, fallback: number): number {
    if (!value) {
        return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function toBlockPolicy(value: string | undefined): BlockPolicy[] {
    const allowed: BlockPolicy[] = ['reject', 'forward', 'telegram'];
    const list = (value || 'telegram').split(',').map(item => item.trim()) as BlockPolicy[];
    const filtered = list.filter(item => allowed.includes(item));
    return filtered.length > 0 ? filtered : ['telegram'];
}

function toMaxSizePolicy(value: string | undefined): MaxEmailSizePolicy {
    const allowed: MaxEmailSizePolicy[] = ['unhandled', 'continue', 'truncate'];
    return allowed.includes(value as MaxEmailSizePolicy) ? (value as MaxEmailSizePolicy) : 'truncate';
}

/** Defaults derived from deployment variables. */
export function defaultSettings(env: Environment): RuntimeSettings {
    return {
        autoCleanupDays: toInt(env.AUTO_CLEANUP_DAYS, 7),
        attachmentSaveEnabled: toBool(env.ATTACHMENT_SAVE_ENABLED, true),
        attachmentMaxSize: toInt(env.ATTACHMENT_MAX_SIZE, 25 * 1024 * 1024),
        blockPolicy: toBlockPolicy(env.BLOCK_POLICY),
        forwardList: (env.FORWARD_LIST || '').split(',').map(item => item.trim()).filter(Boolean),
        maxEmailSize: toInt(env.MAX_EMAIL_SIZE, 512 * 1024),
        maxEmailSizePolicy: toMaxSizePolicy(env.MAX_EMAIL_SIZE_POLICY),
        summaryEnabled: Boolean((env.AI && env.WORKERS_AI_MODEL) || env.OPENAI_API_KEY),
        openaiApiKey: env.OPENAI_API_KEY || '',
        workersAiModel: env.WORKERS_AI_MODEL || '',
        openaiChatModel: env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        openaiCompletionsApi: env.OPENAI_COMPLETIONS_API || 'https://api.openai.com/v1/chat/completions',
        summaryTargetLang: env.SUMMARY_TARGET_LANG || 'english',
        forwardEnabled: (env.FORWARD_LIST || '').trim().length > 0,
    };
}

/** Merge deployment defaults with the overrides stored in D1. */
export function mergeSettings(base: RuntimeSettings, stored: Record<string, string>): RuntimeSettings {
    const result = { ...base };
    // Guards are uniformly `!== undefined` so an explicitly saved empty
    // string clears the stored value instead of being silently ignored.
    if (stored[SETTING_KEYS.autoCleanupDays] !== undefined) {
        result.autoCleanupDays = toInt(stored[SETTING_KEYS.autoCleanupDays], result.autoCleanupDays);
    }
    if (stored[SETTING_KEYS.attachmentSaveEnabled] !== undefined) {
        result.attachmentSaveEnabled = toBool(stored[SETTING_KEYS.attachmentSaveEnabled], result.attachmentSaveEnabled);
    }
    if (stored[SETTING_KEYS.attachmentMaxSize] !== undefined) {
        result.attachmentMaxSize = toInt(stored[SETTING_KEYS.attachmentMaxSize], result.attachmentMaxSize);
    }
    if (stored[SETTING_KEYS.blockPolicy] !== undefined) {
        result.blockPolicy = toBlockPolicy(stored[SETTING_KEYS.blockPolicy]);
    }
    if (stored[SETTING_KEYS.forwardList] !== undefined) {
        result.forwardList = loadArrayFromRaw(stored[SETTING_KEYS.forwardList]);
    }
    if (stored[SETTING_KEYS.maxEmailSize] !== undefined) {
        result.maxEmailSize = toInt(stored[SETTING_KEYS.maxEmailSize], result.maxEmailSize);
    }
    if (stored[SETTING_KEYS.maxEmailSizePolicy] !== undefined) {
        result.maxEmailSizePolicy = toMaxSizePolicy(stored[SETTING_KEYS.maxEmailSizePolicy]);
    }
    if (stored[SETTING_KEYS.summaryEnabled] !== undefined) {
        result.summaryEnabled = toBool(stored[SETTING_KEYS.summaryEnabled], result.summaryEnabled);
    }
    if (stored[SETTING_KEYS.openaiApiKey] !== undefined) {
        result.openaiApiKey = stored[SETTING_KEYS.openaiApiKey];
    }
    if (stored[SETTING_KEYS.workersAiModel] !== undefined) {
        result.workersAiModel = stored[SETTING_KEYS.workersAiModel];
    }
    if (stored[SETTING_KEYS.openaiChatModel] !== undefined) {
        result.openaiChatModel = stored[SETTING_KEYS.openaiChatModel];
    }
    if (stored[SETTING_KEYS.openaiCompletionsApi] !== undefined) {
        result.openaiCompletionsApi = stored[SETTING_KEYS.openaiCompletionsApi];
    }
    if (stored[SETTING_KEYS.summaryTargetLang] !== undefined) {
        result.summaryTargetLang = stored[SETTING_KEYS.summaryTargetLang];
    }
    if (stored[SETTING_KEYS.forwardEnabled] !== undefined) {
        result.forwardEnabled = toBool(stored[SETTING_KEYS.forwardEnabled], result.forwardEnabled);
    }
    return result;
}

/** Load effective runtime settings for a request. */
export async function loadSettings(env: Environment): Promise<RuntimeSettings> {
    const dao = new Dao(env.DB);
    const stored = await dao.getSettings();
    return mergeSettings(defaultSettings(env), stored);
}

/** Persist a partial update made from the Mini App. */
export async function saveSettings(dao: Dao, patch: Partial<RuntimeSettings>): Promise<void> {
    const entries: Record<string, string> = {};
    if (patch.autoCleanupDays !== undefined) {
        entries[SETTING_KEYS.autoCleanupDays] = `${patch.autoCleanupDays}`;
    }
    if (patch.attachmentSaveEnabled !== undefined) {
        entries[SETTING_KEYS.attachmentSaveEnabled] = `${patch.attachmentSaveEnabled}`;
    }
    if (patch.attachmentMaxSize !== undefined) {
        entries[SETTING_KEYS.attachmentMaxSize] = `${patch.attachmentMaxSize}`;
    }
    if (patch.blockPolicy !== undefined) {
        entries[SETTING_KEYS.blockPolicy] = patch.blockPolicy.join(',');
    }
    if (patch.forwardList !== undefined) {
        entries[SETTING_KEYS.forwardList] = JSON.stringify(patch.forwardList);
    }
    if (patch.maxEmailSize !== undefined) {
        entries[SETTING_KEYS.maxEmailSize] = `${patch.maxEmailSize}`;
    }
    if (patch.maxEmailSizePolicy !== undefined) {
        entries[SETTING_KEYS.maxEmailSizePolicy] = patch.maxEmailSizePolicy;
    }
    if (patch.summaryEnabled !== undefined) {
        entries[SETTING_KEYS.summaryEnabled] = `${patch.summaryEnabled}`;
    }
    if (patch.openaiApiKey !== undefined) {
        entries[SETTING_KEYS.openaiApiKey] = patch.openaiApiKey.trim();
    }
    if (patch.workersAiModel !== undefined) {
        entries[SETTING_KEYS.workersAiModel] = patch.workersAiModel;
    }
    if (patch.openaiChatModel !== undefined) {
        entries[SETTING_KEYS.openaiChatModel] = patch.openaiChatModel;
    }
    if (patch.openaiCompletionsApi !== undefined) {
        entries[SETTING_KEYS.openaiCompletionsApi] = patch.openaiCompletionsApi;
    }
    if (patch.summaryTargetLang !== undefined) {
        entries[SETTING_KEYS.summaryTargetLang] = patch.summaryTargetLang;
    }
    if (patch.forwardEnabled !== undefined) {
        entries[SETTING_KEYS.forwardEnabled] = `${patch.forwardEnabled}`;
    }
    await dao.setSettings(entries);
}

export interface ImportEnvResult {
    settings: RuntimeSettings;
    importedAddresses: { white: number; block: number };
}

/**
 * One-click migration: persist every env-derived setting (and the env white /
 * block lists) into D1 so the deployment no longer depends on those variables.
 */
export async function importSettingsFromEnv(dao: Dao, env: Environment): Promise<ImportEnvResult> {
    await saveSettings(dao, defaultSettings(env));

    const existing = new Set(
        (await dao.listAddresses()).map(item => `${item.type}:${item.address.toLowerCase()}`),
    );
    const importedAddresses = { white: 0, block: 0 };
    const seeds: { type: 'white' | 'block'; patterns: string[] }[] = [
        { type: 'white', patterns: loadArrayFromRaw(env.WHITE_LIST) },
        { type: 'block', patterns: loadArrayFromRaw(env.BLOCK_LIST) },
    ];
    for (const seed of seeds) {
        for (const pattern of seed.patterns) {
            const key = `${seed.type}:${pattern.toLowerCase()}`;
            if (existing.has(key)) {
                continue;
            }
            existing.add(key);
            await dao.addAddress(pattern, seed.type, 'Imported from environment');
            importedAddresses[seed.type] += 1;
        }
    }

    return { settings: await loadSettings(env), importedAddresses };
}
