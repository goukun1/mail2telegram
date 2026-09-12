import type { Environment } from '../types';
import { defaultSettings, mergeSettings } from './settings';

/** `defaultSettings` only reads string vars, so an empty D1 stub is enough. */
function envWith(vars: Record<string, string>): Environment {
    return { DB: {}, ...vars } as unknown as Environment;
}

function defaultEnv(): Environment {
    return envWith({
        AUTO_CLEANUP_DAYS: '30',
        ATTACHMENT_MAX_SIZE: '1048576',
        BLOCK_POLICY: 'reject,telegram',
        FORWARD_LIST: 'backup@example.com',
        MAX_EMAIL_SIZE: '1048576',
    });
}

function testCase() {
    const base = defaultSettings(defaultEnv());
    if (base.autoCleanupDays !== 30) {
        throw new Error(`unexpected autoCleanupDays: ${base.autoCleanupDays}`);
    }
    if (base.blockPolicy.join(',') !== 'reject,telegram') {
        throw new Error(`unexpected blockPolicy: ${base.blockPolicy}`);
    }
    if (base.forwardList.join(',') !== 'backup@example.com') {
        throw new Error(`unexpected forwardList: ${base.forwardList}`);
    }
    if (base.maxEmailSize !== 1048576) {
        throw new Error(`unexpected maxEmailSize: ${base.maxEmailSize}`);
    }
    if (base.maxEmailSizePolicy !== 'truncate') {
        throw new Error(`unexpected maxEmailSizePolicy: ${base.maxEmailSizePolicy}`);
    }
    // Auto-save defaults to on (preserving the pre-setting behaviour) with the
    // env-seeded size cap.
    if (!base.attachmentSaveEnabled) {
        throw new Error(`unexpected attachmentSaveEnabled: ${base.attachmentSaveEnabled}`);
    }
    if (base.attachmentMaxSize !== 1048576) {
        throw new Error(`unexpected attachmentMaxSize: ${base.attachmentMaxSize}`);
    }

    // Stored overrides win over env-derived defaults.
    const merged = mergeSettings(base, {
        auto_cleanup_days: '3',
        attachment_save_enabled: 'false',
        attachment_max_size: '4096',
        block_policy: 'forward',
        forward_list: JSON.stringify(['a@example.com', 'b@example.com']),
        guardian_mode: 'true',
        forward_enabled: 'false',
        openai_chat_model: 'gpt-test',
    });
    if (merged.autoCleanupDays !== 3) {
        throw new Error(`unexpected merged autoCleanupDays: ${merged.autoCleanupDays}`);
    }
    if (merged.blockPolicy.join(',') !== 'forward') {
        throw new Error(`unexpected merged blockPolicy: ${merged.blockPolicy}`);
    }
    if (merged.forwardList.length !== 2 || merged.forwardList[0] !== 'a@example.com') {
        throw new Error(`unexpected merged forwardList: ${merged.forwardList}`);
    }
    if (!merged.guardianMode || merged.forwardEnabled) {
        throw new Error(`unexpected merged flags: guardian=${merged.guardianMode} forward=${merged.forwardEnabled}`);
    }
    if (merged.attachmentSaveEnabled || merged.attachmentMaxSize !== 4096) {
        throw new Error(`unexpected merged attachments: enabled=${merged.attachmentSaveEnabled} size=${merged.attachmentMaxSize}`);
    }
    if (merged.openaiChatModel !== 'gpt-test') {
        throw new Error(`unexpected merged openaiChatModel: ${merged.openaiChatModel}`);
    }

    // An explicitly saved empty string clears the value (regression guard:
    // truthiness guards used to ignore it and keep the previous value).
    const cleared = mergeSettings(base, {
        openai_chat_model: '',
        openai_completions_api: '',
        forward_list: '',
    });
    if (cleared.openaiChatModel !== '') {
        throw new Error(`empty openaiChatModel was ignored: "${cleared.openaiChatModel}"`);
    }
    if (cleared.openaiCompletionsApi !== '') {
        throw new Error(`empty openaiCompletionsApi was ignored: "${cleared.openaiCompletionsApi}"`);
    }
    if (cleared.forwardList.length !== 0) {
        throw new Error(`empty forwardList was ignored: ${cleared.forwardList}`);
    }

    // Invalid stored values fall back to the defaults instead of throwing.
    const invalid = mergeSettings(base, {
        auto_cleanup_days: 'abc',
        attachment_max_size: 'abc',
        max_email_size: '',
        block_policy: 'nonsense',
        max_email_size_policy: 'nonsense',
    });
    if (invalid.autoCleanupDays !== base.autoCleanupDays) {
        throw new Error(`invalid autoCleanupDays not falling back: ${invalid.autoCleanupDays}`);
    }
    if (invalid.attachmentMaxSize !== base.attachmentMaxSize) {
        throw new Error(`invalid attachmentMaxSize not falling back: ${invalid.attachmentMaxSize}`);
    }
    if (invalid.maxEmailSize !== base.maxEmailSize) {
        throw new Error(`invalid maxEmailSize not falling back: ${invalid.maxEmailSize}`);
    }
    if (invalid.blockPolicy.join(',') !== 'telegram' || invalid.maxEmailSizePolicy !== 'truncate') {
        throw new Error(`invalid enums not falling back: ${invalid.blockPolicy} ${invalid.maxEmailSizePolicy}`);
    }

    console.log('mergeSettings ok: overrides, empty-string clears and fallbacks behave');
}

testCase();
