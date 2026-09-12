import type { AddressType, RuntimeSettings } from '../types';
import { List, ListInput, ListItem, Preloader, Segmented, SegmentedButton, Toggle } from 'konsta/react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { NavBar } from '../components/ios/NavBar';
import { useAsync } from '../hooks/useAsync';
import { haptic } from '../lib/haptics';
import { AddressListSection } from './AddressListSection';

export interface SettingsPageProps {
    initialTab?: AddressType | 'test' | null;
    onBack?: () => void;
}

const SUMMARY_LANGS = ['english', 'chinese', 'japanese', 'korean', 'spanish', 'french', 'german'];
const BLOCK_POLICIES: { key: RuntimeSettings['blockPolicy'][number]; label: string }[] = [
    { key: 'telegram', label: 'Do Not Notify' },
    { key: 'forward', label: 'Do Not Forward' },
    { key: 'reject', label: 'Reject Message' },
];

function toList(text: string): string[] {
    return text.split('\n').map(item => item.trim()).filter(Boolean);
}

/** iOS Settings style grouped page for lists, policies and limits. */
export function SettingsPage({ initialTab, onBack }: SettingsPageProps) {
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
        if (initialTab === 'block' || initialTab === 'white') {
            window.setTimeout(() => {
                document.getElementById(`section-${initialTab}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
        }
    }, [initialTab]);

    if (loading || !draft) {
        return (
            <div className="split-column">
                <NavBar title="Settings" onBack={onBack} />
                <div className="spin-center"><Preloader /></div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="split-column">
                <NavBar title="Settings" onBack={onBack} />
                <div className="reader-empty">
                    <div>
                        <p className="mb-3">{error.message}</p>
                        <button type="button" className="text-[var(--ios-blue)]" onClick={reload}>Try Again</button>
                    </div>
                </div>
            </div>
        );
    }

    const update = <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => {
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
        <div className="split-column">
            <NavBar
                title="Settings"
                onBack={onBack}
                right={(
                    <button
                        type="button"
                        className="text-[17px] font-semibold text-[var(--ios-blue)] disabled:opacity-40"
                        onClick={save}
                        disabled={!dirty || saving}
                    >
                        {saving ? 'Saving' : 'Done'}
                    </button>
                )}
            />
            <div className="page-scroll">
                {savedAt && !dirty ? <div className="settings-note">Settings saved.</div> : null}
                {saveError ? <div className="settings-note" style={{ color: '#ff3b30' }}>{saveError}</div> : null}

                <div id="section-white" />
                <div className="settings-section-title">White List</div>
                <AddressListSection
                    type="white"
                    title="Always Deliver"
                    hint="Addresses that are never blocked. Exact addresses and regular expressions are supported."
                    autoTest
                    defaultExpanded={initialTab === 'white'}
                />

                <div id="section-block" />
                <div className="settings-section-title">Block List</div>
                <AddressListSection
                    type="block"
                    title="Blocked Senders"
                    hint="Addresses to block. White list entries take precedence over this list."
                    autoTest
                    defaultExpanded={initialTab === 'block'}
                />

                <div className="settings-section-title">Blocked Mail</div>
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
                <div className="settings-note">Choose what happens when a message matches the block list. Multiple actions can be combined.</div>

                <div className="settings-section-title">Forwarding</div>
                <List strongIos outlineIos>
                    <ListItem
                        title="Forward Mail"
                        after={<Toggle checked={draft.forwardEnabled} onChange={() => update('forwardEnabled', !draft.forwardEnabled)} />}
                    />
                </List>
                {draft.forwardEnabled ? (
                    <List strongIos outlineIos className="!mt-0">
                        <ListInput
                            type="textarea"
                            label="Forward To"
                            placeholder="backup@example.com"
                            value={draft.forwardList.join('\n')}
                            onInput={(e: any) => update('forwardList', toList(e.target.value))}
                        />
                    </List>
                ) : null}
                <div className="settings-note">One address per line. Addresses must be verified in Email Routing.</div>

                <div className="settings-section-title">Summaries</div>
                <List strongIos outlineIos>
                    <ListItem
                        title="Enable Summaries"
                        after={<Toggle checked={draft.summaryEnabled} onChange={() => update('summaryEnabled', !draft.summaryEnabled)} />}
                    />
                </List>
                {draft.summaryEnabled ? (
                    <List strongIos outlineIos className="!mt-0">
                        <ListInput
                            label="Workers AI Model"
                            placeholder="@cf/meta/llama-3-8b-instruct"
                            value={draft.workersAiModel}
                            onChange={(e: any) => update('workersAiModel', e.target.value)}
                            clearButton
                        />
                        <ListInput
                            label="OpenAI Model"
                            placeholder="gpt-4o-mini"
                            value={draft.openaiChatModel}
                            onChange={(e: any) => update('openaiChatModel', e.target.value)}
                            clearButton
                        />
                        <ListInput
                            label="OpenAI Endpoint"
                            placeholder="https://api.openai.com/v1/chat/completions"
                            value={draft.openaiCompletionsApi}
                            onChange={(e: any) => update('openaiCompletionsApi', e.target.value)}
                            clearButton
                        />
                    </List>
                ) : null}
                <div className="px-4 pt-3">
                    <div className="mb-2 text-[13px] text-[var(--ios-gray)]">Summary Language</div>
                    <div className="overflow-x-auto pb-1">
                        <Segmented strong className="ios-segmented ios-segmented--scroll">
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

                <div className="settings-section-title">Mail Handling</div>
                <List strongIos outlineIos>
                    <ListInput
                        type="number"
                        label="Retention (seconds)"
                        value={`${draft.mailTtl}`}
                        onChange={(e: any) => update('mailTtl', Number.parseInt(e.target.value, 10) || 0)}
                    />
                    <ListInput
                        type="number"
                        label="Max Size (bytes)"
                        value={`${draft.maxEmailSize}`}
                        onChange={(e: any) => update('maxEmailSize', Number.parseInt(e.target.value, 10) || 0)}
                    />
                    <ListItem
                        title="Guardian Mode"
                        subtitle="Skip duplicate notifications for the same message"
                        after={<Toggle checked={draft.guardianMode} onChange={() => update('guardianMode', !draft.guardianMode)} />}
                    />
                </List>
                <div className="px-4 pt-3">
                    <div className="mb-2 text-[13px] text-[var(--ios-gray)]">Oversized Mail</div>
                    <Segmented strong className="ios-segmented">
                        <SegmentedButton active={draft.maxEmailSizePolicy === 'truncate'} onClick={() => update('maxEmailSizePolicy', 'truncate')}>Truncate</SegmentedButton>
                        <SegmentedButton active={draft.maxEmailSizePolicy === 'continue'} onClick={() => update('maxEmailSizePolicy', 'continue')}>Continue</SegmentedButton>
                        <SegmentedButton active={draft.maxEmailSizePolicy === 'unhandled'} onClick={() => update('maxEmailSizePolicy', 'unhandled')}>Headers</SegmentedButton>
                    </Segmented>
                </div>

                <div className="settings-section-title">Bot Commands</div>
                <List strongIos outlineIos>
                    <ListItem title="/start" after="Open Mini App" />
                    <ListItem title="/id" after="Chat ID" />
                    <ListItem title="/test" after="Test Address" />
                    <ListItem title="/white" after="White List" />
                    <ListItem title="/block" after="Block List" />
                </List>
                <div className="settings-note">Reply to a forwarded message in Telegram to answer the sender through Resend.</div>
                <div style={{ height: 24 }} />
            </div>
        </div>
    );
}
