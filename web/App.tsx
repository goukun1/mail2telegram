import type { AddressType, Folder, MeResponse } from './types';
import { useCallback, useState } from 'react';
import { App as KonstaApp, Preloader } from 'konsta/react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api/client';
import { AppProvider } from './AppContext';
import { useAsync } from './hooks/useAsync';
import { useDarkMode } from './hooks/useTheme';
import { useMediaQuery } from './hooks/useMediaQuery';
import { isDesktopPlatform } from './init';
import { AppShell } from './layout/AppShell';
import { TabBar } from './layout/TabBar';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';
import { BackButtonBridge } from './components/common/BackButtonBridge';
import { MailReader } from './components/mail/MailReader';
import { StatePlaceholder } from './components/common/Placeholder';

function InboxRoute({ regular, folder, unread, onUnreadChange }: {
    regular: boolean;
    folder: Folder;
    unread: number;
    onUnreadChange: (value: number) => void;
}) {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const selectedId = params.get('id');

    const closeReader = () => {
        const next = new URLSearchParams(params);
        next.delete('id');
        navigate({ pathname: '/inbox', search: next.toString() });
    };

    return (
        <>
            <InboxPage
                folder={folder}
                onFolderChange={folderKey => navigate(`/inbox?folder=${folderKey}`)}
                selectedId={selectedId}
                onSelect={(id) => {
                    if (!id) {
                        closeReader();
                        return;
                    }
                    navigate(`/inbox?folder=${folder}&id=${id}`);
                }}
                regular={regular}
                onUnreadChange={onUnreadChange}
            />
            {!regular && selectedId ? (
                <div className="fixed inset-0 z-40 bg-[var(--tg-theme-bg-color,#fff)] dark:bg-black">
                    <MailReader
                        key={selectedId}
                        emailId={selectedId}
                        onDeleted={closeReader}
                    />
                </div>
            ) : null}
        </>
    );
}

function SettingsRoute({ regular }: { regular: boolean }) {
    const [params] = useSearchParams();
    const tab = params.get('tab') as AddressType | 'test' | null;
    return (
        <div className={regular ? 'h-full overflow-y-auto' : 'pb-20'}>
            <SettingsPage initialTab={tab} />
        </div>
    );
}

function Shell({ me, refreshMe }: { me: MeResponse; refreshMe: () => void }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [unread, setUnread] = useState(0);
    const [params] = useSearchParams();

    const wide = useMediaQuery('(min-width: 900px)');
    const regular = wide || isDesktopPlatform();
    const folder = ((): Folder => {
        const value = params.get('folder');
        return value === 'spam' || value === 'trash' || value === 'sent' ? value : 'inbox';
    })();

    const isSettings = location.pathname.startsWith('/settings');
    const onUnreadChange = useCallback((value: number) => setUnread(value), []);

    return (
        <AppProvider value={{ me, refreshMe }}>
            <BackButtonBridge />
            <AppShell
                regular={regular}
                folder={folder}
                unread={unread}
                onFolderChange={folderKey => navigate(`/inbox?folder=${folderKey}`)}
                onOpenSettings={() => navigate('/settings')}
            >
                <Routes>
                    <Route path="/" element={<Navigate to="/inbox" replace />} />
                    <Route
                        path="/inbox"
                        element={<InboxRoute regular={regular} folder={folder} unread={unread} onUnreadChange={onUnreadChange} />}
                    />
                    <Route path="/settings" element={<SettingsRoute regular={regular} />} />
                    <Route path="*" element={<Navigate to="/inbox" replace />} />
                </Routes>
            </AppShell>
            {!regular ? (
                <TabBar
                    active={isSettings ? 'settings' : 'inbox'}
                    unread={unread}
                    onChange={(tab) => navigate(tab === 'settings' ? '/settings' : '/inbox')}
                />
            ) : null}
        </AppProvider>
    );
}

function AppInner() {
    const dark = useDarkMode();
    const { data, loading, error, reload } = useAsync<MeResponse>(() => api.me(), []);

    if (loading && !data) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Preloader />
            </div>
        );
    }
    if (error || !data) {
        return (
            <StatePlaceholder
                error={error || new Error('Unable to authenticate with Telegram. Reopen the Mini App from the bot.')}
                onRetry={reload}
            />
        );
    }

    return (
        <KonstaApp theme="ios" safeAreas dark={dark} className={dark ? 'dark' : ''}>
            <Shell me={data} refreshMe={reload} />
        </KonstaApp>
    );
}

/** Root application: Telegram-themed Konsta shell with hash-based routing. */
export function App() {
    return (
        <HashRouter>
            <AppInner />
        </HashRouter>
    );
}
