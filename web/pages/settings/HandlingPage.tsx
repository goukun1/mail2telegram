import { List, ListInput, ListItem, Segmented, SegmentedButton, Toggle } from 'konsta/react';
import { SettingsSubPage } from './SettingsSubPage';
import { useSettingsDraft } from './useSettingsDraft';

/** Retention, size limits and duplicate suppression. */
export function HandlingPage() {
    const { draft, loading, error, reload, update } = useSettingsDraft();

    return (
        <SettingsSubPage title="Mail Handling" loading={loading || !draft} error={error ?? null} onRetry={reload}>
            {draft ? (
                <>
                    <List strongIos outlineIos className="!mt-3">
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
                    <div className="settings-section-title">Oversized Mail</div>
                    <div className="px-4">
                        <Segmented strong className="ios-segmented">
                            <SegmentedButton active={draft.maxEmailSizePolicy === 'truncate'} onClick={() => update('maxEmailSizePolicy', 'truncate')}>Truncate</SegmentedButton>
                            <SegmentedButton active={draft.maxEmailSizePolicy === 'continue'} onClick={() => update('maxEmailSizePolicy', 'continue')}>Continue</SegmentedButton>
                            <SegmentedButton active={draft.maxEmailSizePolicy === 'unhandled'} onClick={() => update('maxEmailSizePolicy', 'unhandled')}>Headers</SegmentedButton>
                        </Segmented>
                    </div>
                    <div className="settings-note">
                        Retention applies to the notification cache. Oversized policy decides whether the body is truncated, parsed fully, or only the headers are kept.
                    </div>
                </>
            ) : null}
        </SettingsSubPage>
    );
}
