import { List, ListItem, Preloader } from 'konsta/react';
import { useState } from 'react';
import { api } from '../../api/client';
import { haptic } from '../../lib/haptics';
import { SettingsSubPage } from './SettingsSubPage';

interface RebindState { status: 'idle' | 'running' | 'ok' | 'error'; message?: string }

/** Bot commands reference plus a webhook rebind action. */
export function BotPage() {
    const [state, setState] = useState<RebindState>({ status: 'idle' });

    const rebind = async () => {
        setState({ status: 'running' });
        haptic.impact();
        try {
            const result = await api.rebindWebhook();
            const ok = result?.webhook?.ok !== false;
            setState({ status: ok ? 'ok' : 'error', message: result?.webhook?.description || 'Webhook re-registered.' });
            haptic.notification(ok ? 'success' : 'error');
        } catch (e) {
            setState({ status: 'error', message: (e as Error).message });
            haptic.notification('error');
        }
    };

    return (
        <SettingsSubPage title="Bot & Webhook">
            <div className="settings-section-title">Webhook</div>
            <List strongIos outlineIos className="!mt-0">
                <ListItem
                    link
                    title={state.status === 'running' ? 'Rebinding…' : 'Rebind Webhook'}
                    onClick={state.status === 'running' ? undefined : rebind}
                    className={state.status === 'running' ? 'opacity-60' : ''}
                    after={state.status === 'running' ? <Preloader /> : undefined}
                />
            </List>
            <div className="settings-note">
                Re-registers the Telegram webhook and the bot command list. Run this after changing the worker domain or when the bot stops responding.
            </div>
            {state.message ? (
                <div className="settings-note" style={{ color: state.status === 'error' ? '#ff3b30' : 'var(--ios-gray)' }}>
                    {state.message}
                </div>
            ) : null}

            <div className="settings-section-title">Commands</div>
            <List strongIos outlineIos className="!mt-0">
                <ListItem title="/start" after="Open Mini App" />
                <ListItem title="/id" after="Chat ID" />
                <ListItem title="/test" after="Test Address" />
                <ListItem title="/white" after="White List" />
                <ListItem title="/block" after="Block List" />
            </List>
            <div className="settings-note">
                Reply to any forwarded message in Telegram to answer the sender through Resend.
            </div>
        </SettingsSubPage>
    );
}
