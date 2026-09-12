import type { Folder, MeResponse } from './types';
import { App as KonstaApp, Preloader } from 'konsta/react';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api/client';
import { AppProvider } from './AppContext';
import { MessageReader } from './components/ios/MessageReader';
import { SettingsNav } from './components/ios/SettingsNav';
import { useAsync } from './hooks/useAsync';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useDarkMode } from './hooks/useTheme';
import { isDesktopPlatform } from './init';
import { MessageTabBar } from './layout/TabBar';
import { InboxPage } from './pages/InboxPage';
import { SettingsPage } from './pages/SettingsPage';

const FOLDERS: Folder[] = ['inbox', 'spam', 'trash', 'sent'];

function parseFolder(value: string | null): Folder {
    return FOLDERS.includes(value as Folder) ? (value as Folder) : 'inbox';
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

    const wide = useMediaQuery('(min-width: 900px)');
    const regular = wide || isDesktopPlatform();
    const folder = parseFolder(params.get('folder'));
    const selectedId = params.get('id');
    const isSettings = location.pathname.startsWith('/settings');
    const onUnreadChange = useCallback((value: number) => setUnread(value), []);

    const closeReader = useCallback(() => {
        const next = new URLSearchParams(params);
        next.delete('id');
        navigate({ pathname: '/inbox', search: next.toString() });
    }, [navigate, params]);

    // iPadOS: mail columns side by side, or a two column settings layout.
    if (regular) {
        return (
            <AppProvider value={{ me, refreshMe }}>
                {isSettings ? (
                    <div className="split-view split-view--sidebar">
                        <div className="split-column split-column--sidebar">
                            <div className="page-scroll">
                                <SettingsNav isSettings onOpenInbox={() => navigate('/inbox')} onOpenSettings={() => navigate('/settings')} />
                            </div>
                        </div>
                        <SettingsPage
                            initialTab={parseAddressTab(params.get('tab'))}
                            onBack={() => navigate('/inbox')}
                        />
                    </div>
                ) : (
                    <InboxPage
                        folder={folder}
                        onFolderChange={key => navigate(`/inbox?folder=${key}`)}
                        selectedId={selectedId}
                        onSelect={(id) => {
                            if (!id) {
                                closeReader();
                                return;
                            }
                            navigate(`/inbox?folder=${folder}&id=${id}`);
                        }}
                        showSidebar
                        onUnreadChange={onUnreadChange}
                    />
                )}
            </AppProvider>
        );
    }

    // iPhone: a single column with the native-style tab bar at the bottom.
    return (
        <AppProvider value={{ me, refreshMe }}>
            <div className="app-shell">
                <div className="app-shell__content">
                    {isSettings ? (
                        <Routes>
                            <Route
                                path="/settings"
                                element={<SettingsPage initialTab={parseAddressTab(params.get('tab'))} onBack={() => navigate('/inbox')} />}
                            />
                        </Routes>
                    ) : (
                        <InboxPage
                            folder={folder}
                            onFolderChange={key => navigate(`/inbox?folder=${key}`)}
                            selectedId={selectedId}
                            onSelect={(id) => {
                                if (!id) {
                                    closeReader();
                                    return;
                                }
                                navigate(`/inbox?folder=${folder}&id=${id}`);
                            }}
                            showSidebar={false}
                            onUnreadChange={onUnreadChange}
                        />
                    )}
                </div>
                <MessageTabBar
                    active={isSettings ? 'settings' : 'inbox'}
                    unread={unread}
                    onChange={tab => navigate(tab === 'settings' ? '/settings' : '/inbox')}
                />
            </div>

            {selectedId && !isSettings ? (
                <div className="fixed inset-0 z-40 flex flex-col bg-[var(--ios-surface)]">
                    <CompactReader
                        emailId={selectedId}
                        onBack={closeReader}
                        onDeleted={closeReader}
                    />
                </div>
            ) : null}
        </AppProvider>
    );
}

function CompactReader({ emailId, onBack, onDeleted }: { emailId: string; onBack: () => void; onDeleted: () => void }) {
    // The reader itself owns the navbar; the native back button is requested there.
    return <MessageReader emailId={emailId} onBack={onBack} onDeleted={onDeleted} />;
}

function parseAddressTab(value: string | null): 'block' | 'white' | 'test' | null {
    return value === 'block' || value === 'white' || value === 'test' ? value : null;
}

function AppInner() {
    const dark = useDarkMode();
    const { data, loading, error, reload } = useAsync<MeResponse>(() => api.me(), []);

    // Keep the document palette in sync so `color-scheme`, our CSS variables and
    // Konsta's dark variants all describe the same theme.
    useEffect(() => {
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.style.background = '';
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
