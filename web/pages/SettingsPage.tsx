import type { AddressType, RuntimeSettings } from '../types';
import { useEffect, useState } from 'react';
import { Block, Button, List, ListInput, ListItem, Preloader, Segmented, SegmentedButton, Toggle } from 'konsta/react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { haptic } from '../lib/haptics';
import { AddressListSection } from './AddressListSection';

export interface SettingsPageProps {
    initialTab?: AddressType | 'test' | null;
}

type SettingKey = keyof RuntimeSettings;

const SUMMARY_LANGS = ['english', 'chinese', 'japanese', 'korean', 'spanish', 'french', 'german'];
const BLOCK_POLICIES: { key: RuntimeSettings['blockPolicy'][number]; label: string }[] = [
    { key: 'telegram', label: 'Skip Telegram' },
    { key: 'forward', label: 'Skip forward' },
    { key: 'reject', label: 'Reject' },
];

function toList(text: string): string[] {
    return text.split('\n').map(item => item.trim()).filter(Boolean);
}

export function SettingsPage({ initialTab }: SettingsPageProps) {
    const { data, loading, error, reload, setData } = useAsync<{ settings: RuntimeSettings }>(
        () => api.getSettings(),
        [],
    );
    const [draft, setDraft] = useState<RuntimeSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    useEffect(() => {
        if (data?.settings) {
            setDraft({ ...data.settings });
        }
    }, [data]);

    useEffect(() => {
        if (initialTab && (initialTab === 'block' || initialTab === 'white')) {
            window.setTimeout(() => {
                document.getElementById(`section-${initialTab}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 150);
        }
    }, [initialTab]);

    if (loading || !draft) {
        return <div className="flex justify-center py-16"><Preloader /></div>;
    }
    if (error) {
        return (
            <Block>
                <div className="text-center text-[15px] text-red-600">
                    <p>{error.message}</p>
                    <Button rounded tonal onClick={reload}>Retry</Button>
                </div>
            </Block>
        );
    }

    const update = <K extends SettingKey>(key: K, value: RuntimeSettings[K]) => {
        setDraft(current => (current ? { ...current, [key]: value } : current));
    };

    const dirty = JSON.stringify(draft) !== JSON.stringify(data?.settings);

    const save = async () => {
        setSaving(true);
        setSaveError(null);
        try {
            const result = await api.updateSettings(draft);
            setData(result);
            setDraft({ ...result.settings });
            setSavedAt(Date.now());
            haptic.notification('success');
        } catch (e) {
            haptic.notification('error');
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const togglePolicy = (policy: RuntimeSettings['blockPolicy'][number]) => {
        const has = draft.blockPolicy.includes(policy);
        update('blockPolicy', has ? draft.blockPolicy.filter(item => item !== policy) : [...draft.blockPolicy, policy]);
    };

    return (
        <div className="pb-24">
            <Block className="!my-2">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="m-0 text-[26px] font-bold">Settings</h1>
                    <Button
                        rounded
                        onClick={save}
                        disabled={!dirty || saving}
                    >
                        {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                    </Button>
                </div>
                {savedAt ? (
                    <div className="settings-hint !px-0">Saved just now.</div>
                ) : null}
                {saveError ? <div className="text-[13px] text-red-600">{saveError}</div> : null}
            </Block>

            <div id="section-white" />
            <AddressListSection
                type="white"
                title="White list"
                hint="Addresses that should always be delivered and never blocked. Exact addresses and regular expressions are supported."
                autoTest
                defaultExpanded={initialTab === 'white'}
            />

            <div id="section-block" />
            <AddressListSection
                type="block"
                title="Block list"
                hint="Addresses that should be blocked. White list entries take precedence over this list."
                autoTest
                defaultExpanded={initialTab === 'block'}
            />

            <Block className="!my-3">
                <h2 className="mb-1 px-1 text-[17px] font-semibold">Blocked mail policy</h2>
                <p className="settings-hint !px-1">
                    Choose what happens when a message matches the block list. Multiple actions can be selected.
                </p>
                <List strongIos outlineIos>
                    {BLOCK_POLICIES.map(policy => (
                        <ListItem
                            key={policy.key}
                            title={policy.label}
                            after={(
                                <Toggle
                                    checked={draft.blockPolicy.includes(policy.key)}
                                    onChange={() => togglePolicy(policy.key)}
                                />
                            )}
                        />
                    ))}
                </List>
            </Block>

            <Block className="!my-3">
                <h2 className="mb-1 px-1 text-[17px] font-semibold">Forwarding</h2>
                <p className="settings-hint !px-1">Forward delivered mail to these addresses. One address per line.</p>
                <List strongIos outlineIos>
                    <ListItem
                        title="Enable forwarding"
                        after={<Toggle checked={draft.forwardEnabled} onChange={() => update('forwardEnabled', !draft.forwardEnabled)} />}
                    />
                    <ListInput
                        type="textarea"
                        label="Forward to"
                        placeholder="backup@example.com"
                        value={draft.forwardList.join('\n')}
                        onInput={(e: any) => update('forwardList', toList(e.target.value))}
                    />
                </List>
            </Block>

            <Block className="!my-3">
                <h2 className="mb-1 px-1 text-[17px] font-semibold">Summaries</h2>
                <p className="settings-hint !px-1">AI summaries are shown in the Telegram push and in the reader.</p>
                <List strongIos outlineIos>
                    <ListItem
                        title="Enable summaries"
                        after={<Toggle checked={draft.summaryEnabled} onChange={() => update('summaryEnabled', !draft.summaryEnabled)} />}
                    />
                    <ListInput
                        label="Workers AI model"
                        placeholder="@cf/meta/llama-3-8b-instruct"
                        value={draft.workersAiModel}
                        onChange={(e: any) => update('workersAiModel', e.target.value)}
                        clearButton
                    />
                    <ListInput
                        label="OpenAI chat model"
                        placeholder="gpt-4o-mini"
                        value={draft.openaiChatModel}
                        onChange={(e: any) => update('openaiChatModel', e.target.value)}
                        clearButton
                    />
                    <ListInput
                        label="OpenAI completions API"
                        placeholder="https://api.openai.com/v1/chat/completions"
                        value={draft.openaiCompletionsApi}
                        onChange={(e: any) => update('openaiCompletionsApi', e.target.value)}
                        clearButton
                    />
                </List>
                <div className="mt-3 px-1">
                    <div className="mb-2 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">Summary language</div>
                    <div className="overflow-x-auto">
                        <Segmented strong className="w-max">
                            {SUMMARY_LANGS.map(lang => (
                                <SegmentedButton
                                    key={lang}
                                    active={draft.summaryTargetLang === lang}
                                    onClick={() => update('summaryTargetLang', lang)}
                                >
                                    {lang}
                                </SegmentedButton>
                            ))}
                        </Segmented>
                    </div>
                </div>
            </Block>

            <Block className="!my-3">
                <h2 className="mb-1 px-1 text-[17px] font-semibold">Mail handling</h2>
                <p className="settings-hint !px-1">Limits applied while receiving and parsing inbound mail.</p>
                <List strongIos outlineIos>
                    <ListInput
                        type="number"
                        label="History retention (seconds)"
                        value={`${draft.mailTtl}`}
                        onChange={(e: any) => update('mailTtl', Number.parseInt(e.target.value, 10) || 0)}
                    />
                    <ListInput
                        type="number"
                        label="Max email size (bytes)"
                        value={`${draft.maxEmailSize}`}
                        onChange={(e: any) => update('maxEmailSize', Number.parseInt(e.target.value, 10) || 0)}
                    />
                    <ListItem
                        title="Guardian mode"
                        subtitle="Skip duplicate notifications for the same message id"
                        after={<Toggle checked={draft.guardianMode} onChange={() => update('guardianMode', !draft.guardianMode)} />}
                    />
                </List>
                <div className="mt-3 px-1">
                    <div className="mb-2 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">Oversized mail policy</div>
                    <Segmented strong className="w-max">
                        <SegmentedButton active={draft.maxEmailSizePolicy === 'truncate'} onClick={() => update('maxEmailSizePolicy', 'truncate')}>Truncate</SegmentedButton>
                        <SegmentedButton active={draft.maxEmailSizePolicy === 'continue'} onClick={() => update('maxEmailSizePolicy', 'continue')}>Continue</SegmentedButton>
                        <SegmentedButton active={draft.maxEmailSizePolicy === 'unhandled'} onClick={() => update('maxEmailSizePolicy', 'unhandled')}>Unhandled</SegmentedButton>
                    </Segmented>
                </div>
            </Block>

            <Block className="!my-3">
                <h2 className="mb-1 px-1 text-[17px] font-semibold">Commands</h2>
                <List strongIos outlineIos>
                    <ListItem title="/start" subtitle="Open this Mini App from the bot" />
                    <ListItem title="/id" subtitle="Show your Telegram chat ID" />
                    <ListItem title="/test" subtitle="Open this app to test an address" />
                    <ListItem title="/white" subtitle="Jump to the white list" />
                    <ListItem title="/block" subtitle="Jump to the block list" />
                </List>
                <p className="settings-hint !px-1">
                    Reply to any forwarded email in Telegram to answer it through Resend.
                </p>
            </Block>
        </div>
    );
}
