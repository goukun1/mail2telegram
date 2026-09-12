import { List, ListInput, ListItem, Toggle } from 'konsta/react';
import { SettingsSubPage } from './SettingsSubPage';
import { useSettingsDraft } from './useSettingsDraft';

function toList(text: string): string[] {
    return text.split('\n').map(item => item.trim()).filter(Boolean);
}

/** Forwarding toggle and destination addresses. */
export function ForwardingPage() {
    const { draft, loading, error, reload, update } = useSettingsDraft();

    return (
        <SettingsSubPage title="Forwarding" loading={loading || !draft} error={error ?? null} onRetry={reload}>
            {draft ? (
                <>
                    <List strongIos outlineIos className="!mt-3">
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
                    <div className="settings-note">
                        One address per line. Each address must be verified under Email Routing destination addresses.
                    </div>
                </>
            ) : null}
        </SettingsSubPage>
    );
}
