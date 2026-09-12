import { List, ListInput, Segmented, SegmentedButton } from 'konsta/react';
import { ToggleRow } from '../../components/ios/ToggleRow';
import { formatBytes } from '../../lib/format';
import { SettingsSubPage } from './SettingsSubPage';
import { useSettingsDraft } from './useSettingsDraft';

/** Seconds rendered as a rough human duration, e.g. "about 3 days". */
function formatDuration(seconds: number): string {
    if (seconds <= 0) {
        return 'forever';
    }
    const units: [number, string][] = [
        [86400, 'day'],
        [3600, 'hour'],
        [60, 'minute'],
    ];
    for (const [size, label] of units) {
        if (seconds >= size) {
            const value = Math.round(seconds / size);
            return `about ${value} ${label}${value === 1 ? '' : 's'}`;
        }
    }
    return `about ${seconds} seconds`;
}

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
                            label="Auto Cleanup (days)"
                            value={`${draft.autoCleanupDays}`}
                            onChange={(e: any) => update('autoCleanupDays', Number.parseInt(e.target.value, 10) || 0)}
                        />
                        <ListInput
                            type="number"
                            label="Max Size (bytes)"
                            value={`${draft.maxEmailSize}`}
                            onChange={(e: any) => update('maxEmailSize', Number.parseInt(e.target.value, 10) || 0)}
                        />
                        <ToggleRow
                            title="Guardian Mode"
                            subtitle="Skip duplicate notifications for the same message"
                            checked={draft.guardianMode}
                            onChange={value => update('guardianMode', value)}
                        />
                    </List>
                    <div className="settings-note">
                        Notifications are kept for
                        {' '}
                        {formatDuration(draft.mailTtl)}
                        ; messages over
                        {' '}
                        {formatBytes(draft.maxEmailSize)}
                        {' '}
                        count as oversized.
                    </div>
                    <div className="settings-section-title">Oversized Mail</div>
                    <div className="px-4">
                        <Segmented strong className="ios-segmented">
                            <SegmentedButton active={draft.maxEmailSizePolicy === 'truncate'} onClick={() => update('maxEmailSizePolicy', 'truncate')}>Truncate</SegmentedButton>
                            <SegmentedButton active={draft.maxEmailSizePolicy === 'continue'} onClick={() => update('maxEmailSizePolicy', 'continue')}>Continue</SegmentedButton>
                            <SegmentedButton active={draft.maxEmailSizePolicy === 'unhandled'} onClick={() => update('maxEmailSizePolicy', 'unhandled')}>Headers</SegmentedButton>
                        </Segmented>
                    </div>
                    <div className="settings-note">
                        Retention applies to the notification cache. Oversized policy decides whether the body is truncated, parsed fully, or only the headers are kept. A daily cron deletes mail older than Auto Cleanup days, together with its attachments (0 keeps everything); use Clear Mail for one-off cleanups.
                    </div>
                </>
            ) : null}
        </SettingsSubPage>
    );
}
