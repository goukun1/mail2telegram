import { List, ListInput } from 'konsta/react';
import { ToggleRow } from '../../components/ios/ToggleRow';
import { SettingsSubPage } from './SettingsSubPage';
import { useSettingsDraft } from './useSettingsDraft';

const SUMMARY_LANGS: { value: string; label: string }[] = [
    { value: 'english', label: 'English' },
    { value: 'chinese', label: 'Chinese' },
    { value: 'japanese', label: 'Japanese' },
    { value: 'korean', label: 'Korean' },
    { value: 'spanish', label: 'Spanish' },
    { value: 'french', label: 'French' },
    { value: 'german', label: 'German' },
];

/** AI summary provider, model and language. */
export function SummariesPage() {
    const { draft, loading, error, reload, update } = useSettingsDraft();

    return (
        <SettingsSubPage title="Summaries" loading={loading || !draft} error={error ?? null} onRetry={reload}>
            {draft ? (
                <>
                    <List strongIos outlineIos className="!mt-3">
                        <ToggleRow
                            title="Enable Summaries"
                            checked={draft.summaryEnabled}
                            onChange={value => update('summaryEnabled', value)}
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
                                label="OpenAI API Key"
                                type="password"
                                placeholder="sk-..."
                                value={draft.openaiApiKey}
                                onChange={(e: any) => update('openaiApiKey', e.target.value)}
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
                    <List strongIos outlineIos className="!mt-0">
                        <ListInput
                            label="Summary Language"
                            type="select"
                            dropdown
                            value={draft.summaryTargetLang}
                            onChange={(e: any) => update('summaryTargetLang', e.target.value)}
                        >
                            {SUMMARY_LANGS.map(lang => (
                                <option key={lang.value} value={lang.value}>
                                    {lang.label}
                                </option>
                            ))}
                        </ListInput>
                    </List>
                    <div className="settings-note">
                        Summaries appear in the Telegram push and in the message reader. Changes save automatically.
                    </div>
                </>
            ) : null}
        </SettingsSubPage>
    );
}
