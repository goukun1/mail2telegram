import { List, ListInput, ListItem, Segmented, SegmentedButton, Toggle } from 'konsta/react';
import { SettingsSubPage } from './SettingsSubPage';
import { useSettingsDraft } from './useSettingsDraft';

const SUMMARY_LANGS = ['english', 'chinese', 'japanese', 'korean', 'spanish', 'french', 'german'];

/** AI summary provider, model and language. */
export function SummariesPage() {
    const { draft, loading, error, reload, update } = useSettingsDraft();

    return (
        <SettingsSubPage title="Summaries" loading={loading || !draft} error={error ?? null} onRetry={reload}>
            {draft ? (
                <>
                    <List strongIos outlineIos className="!mt-3">
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
                    <div className="settings-section-title">Language</div>
                    <div className="overflow-x-auto px-4 pb-1">
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
                    <div className="settings-note">
                        Summaries appear in the Telegram push and in the message reader. Changes save automatically.
                    </div>
                </>
            ) : null}
        </SettingsSubPage>
    );
}
