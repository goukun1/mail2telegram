import type { Folder, MeResponse } from './types';
import { App as KonstaApp, Preloader } from 'konsta/react';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api/client';
import { AppProvider } from './AppContext';
import { MessageReader } from './components/ios/MessageReader';
import { useAsync } from './hooks/useAsync';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useDarkMode } from './hooks/useTheme';
import { Sidebar } from './layout/Sidebar';
import { MessageTabBar } from './layout/TabBar';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';

const FOLDERS: Folder[] = ['inbox', 'spam', 'trash', 'sent'];

/** Below this width the app uses the single column phone layout. */
export const SPLIT_MIN_WIDTH = 720;
/** At or above this width the reader gets its own column. */
export const READER_COLUMN_MIN_WIDTH = 1040;

function parseFolder(value: string | null): Folder {
    return FOLDERS.includes(value as Folder) ? (value as Folder) : 'inbox';
}

function parseAddressTab(value: string | null): 'block' | 'white' | 'test' | null {
    return value === 'block' || value === 'white' || value === 'test' ? value : null;
}

interface ShellProps {
    me: MeResponse;
    refreshMe: () => void;
}

function Shell({ me, refreshMe }: ShellProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();
    const [unread, setUnread] = useState(0);

    // The layout is driven purely by the available width, never by platform:
    //   < 720px   single column with the tab bar (phones)
    //   >= 720px  mailboxes + list, reader opens over them
    //   >= 1040px mailboxes + list + reader as three columns
    const split = useMediaQuery(`(min-width: ${SPLIT_MIN_WIDTH}px)`);
    const readerColumn = useMediaQuery(`(min-width: ${READER_COLUMN_MIN_WIDTH}px)`);

    const folder = parseFolder(params.get('folder'));
    const selectedId = params.get('id');
    const isSettings = location.pathname.startsWith('/settings');
    const onUnreadChange = useCallback((value: number) => setUnread(value), []);

    const closeReader = useCallback(() => {
        const next = new URLSearchParams(params);
        next.delete('id');
        navigate({ pathname: '/inbox', search: next.toString() });
    }, [navigate, params]);

    const openSettings = useCallback(() => navigate('/settings'), [navigate]);
    const openFolder = useCallback((key: Folder) => navigate(`/inbox?folder=${key}`), [navigate]);

    const sidebarPane = (settingsActive: boolean) => (
        <div className="split-column split-column--sidebar">
            <Sidebar
                folder={folder}
                unread={unread}
                isSettings={settingsActive}
                onOpenSettings={openSettings}
                onSelectFolder={openFolder}
            />
        </div>
    );

    // Split layout. Settings is a column, never a tab.
    if (split) {
        return (
            <AppProvider value={{ me, refreshMe }}>
                {isSettings ? (
                    <div className="split-view split-view--sidebar">
                        {sidebarPane(true)}
                        <SettingsPage
                            initialTab={parseAddressTab(params.get('tab'))}
                            onBack={() => navigate('/inbox')}
                        />
                    </div>
                ) : (
                    <InboxPage
                        folder={folder}
                        onFolderChange={openFolder}
                        selectedId={selectedId}
                        onSelect={(id) => {
                            if (!id) {
                                closeReader();
                                return;
                            }
                            navigate(`/inbox?folder=${folder}&id=${id}`);
                        }}
                        showSidebar
                        readerColumn={readerColumn}
                        onUnreadChange={onUnreadChange}
                        onOpenSettings={openSettings}
                    />
                )}
            </AppProvider>
        );
    }

    // Compact phone layout: a single column with the tab bar at the bottom.
    return (
        <AppProvider value={{ me, refreshMe }}>
            <div className="app-shell">
                <div className="app-shell__content">
                    <Routes>
                        <Route
                            path="/settings"
                            element={<SettingsPage initialTab={parseAddressTab(params.get('tab'))} onBack={() => navigate('/inbox')} />}
                        />
                        <Route
                            path="*"
                            element={(
                                <InboxPage
                                    folder={folder}
                                    onFolderChange={openFolder}
                                    selectedId={selectedId}
                                    onSelect={(id) => {
                                        if (!id) {
                                            closeReader();
                                            return;
                                        }
                                        navigate(`/inbox?folder=${folder}&id=${id}`);
                                    }}
                                    showSidebar={false}
                                    readerColumn={false}
                                    onUnreadChange={onUnreadChange}
                                    onOpenSettings={openSettings}
                                />
                            )}
                        />
                    </Routes>
                </div>
                <MessageTabBar
                    active={isSettings ? 'settings' : 'inbox'}
                    unread={unread}
                    onChange={tab => navigate(tab === 'settings' ? '/settings' : '/inbox')}
                />
            </div>

            {selectedId && !isSettings ? (
                <div className="fixed inset-0 z-40 flex flex-col bg-[var(--ios-surface)]">
                    <MessageReader emailId={selectedId} onBack={closeReader} onDeleted={closeReader} />
                </div>
            ) : null}
        </AppProvider>
    );
}

function AppInner() {
    const dark = useDarkMode();
    const { data, loading, error, reload } = useAsync<MeResponse>(() => api.me(), []);

    // Keep the document palette in sync so `color-scheme`, our CSS variables and
    // Konsta's dark variants all describe the same theme.
    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
    }, [dark]);

    if (loading && !data) {
        return <div className="spin-center" style={{ height: '100vh' }}><Preloader /></div>;
    }
    if (error || !data) {
        return (
            <div className="reader-empty" style={{ height: '100vh' }}>
                <div>
                    <p className="mb-3">{error?.message || 'Unable to authenticate with Telegram. Reopen the Mini App from the bot.'}</p>
                    <button type="button" className="text-[var(--ios-blue)]" onClick={reload}>Try Again</button>
                </div>
            </div>
        );
    }

    return (
        <KonstaApp theme="ios" safeAreas dark={dark} className={dark ? 'dark' : ''}>
            <Shell me={data} refreshMe={reload} />
        </KonstaApp>
    );
}

/** Root application: iOS Mail style shell with hash-based routing. */
export function App() {
    return (
        <HashRouter>
            <Routes>
                <Route path="*" element={<AppInner />} />
            </Routes>
        </HashRouter>
    );
}
