import type { Folder, MeResponse } from './types';
import { App as KonstaApp, Preloader } from 'konsta/react';
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from './api/client';
import { AppProvider } from './AppContext';
import { MessageReader } from './components/ios/MessageReader';
import { useAsync } from './hooks/useAsync';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useDarkMode } from './hooks/useTheme';
import { Sidebar } from './layout/Sidebar';
import { MessageTabBar } from './layout/TabBar';
import { InboxPage } from './pages/InboxPage';
import { MailPage } from './pages/MailPage';
import { AddressListPage } from './pages/settings/AddressListPage';
import { BotPage } from './pages/settings/BotPage';
import { ForwardingPage } from './pages/settings/ForwardingPage';
import { HandlingPage } from './pages/settings/HandlingPage';
import { SettingsHub } from './pages/settings/SettingsHub';
import { SummariesPage } from './pages/settings/SummariesPage';

const FOLDERS: Folder[] = ['inbox', 'spam', 'trash', 'sent'];

/** Below this width the app uses the single column phone layout. */
export const SPLIT_MIN_WIDTH = 720;
/** At or above this width the reader gets its own column. */
export const READER_COLUMN_MIN_WIDTH = 1040;

function parseFolder(value: string | null): Folder {
    return FOLDERS.includes(value as Folder) ? (value as Folder) : 'inbox';
}

/**
 * Layout chrome around the routed pages.
 *
 * Width decides between the phone layout (single column plus tab bar) and the
 * split layout (mailboxes sidebar plus content, never a tab bar). Settings is a
 * normal route inside this layout, so neither layout needs a nested router.
 */
function Layout() {
    const location = useLocation();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [unread, setUnread] = useState(0);

    const split = useMediaQuery(`(min-width: ${SPLIT_MIN_WIDTH}px)`);
    const folder = parseFolder(params.get('folder'));
    const selectedId = params.get('id');
    const isSettings = location.pathname.startsWith('/settings');
    // Deep link opened by the Open button on a Telegram notification.
    const mailId = location.pathname.startsWith('/mail/') ? location.pathname.slice('/mail/'.length) : null;

    const onUnreadChange = useCallback((value: number) => setUnread(value), []);
    const openFolder = useCallback((key: Folder) => navigate(`/inbox?folder=${key}`), [navigate]);
    const closeReader = useCallback(() => {
        const next = new URLSearchParams(params);
        next.delete('id');
        navigate({ pathname: '/inbox', search: next.toString() });
    }, [navigate, params]);

    if (split) {
        return (
            <div className="split-view split-view--sidebar">
                <div className="split-column split-column--sidebar">
                    <Sidebar
                        folder={folder}
                        unread={unread}
                        isSettings={isSettings}
                        onOpenSettings={() => navigate('/settings')}
                        onSelectFolder={openFolder}
                    />
                </div>
                <Outlet context={{ onUnreadChange }} />
            </div>
        );
    }

    // On the phone the mail detail route fills the screen like an opened
    // message, so it gets no tab bar. Its back button returns to the inbox.
    if (mailId) {
        return (
            <div className="app-shell">
                <div className="app-shell__content">
                    <Outlet context={{ onUnreadChange }} />
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell">
            <div className="app-shell__content">
                <Outlet context={{ onUnreadChange }} />
            </div>
            <MessageTabBar
                active={isSettings ? 'settings' : 'inbox'}
                unread={unread}
                onChange={tab => navigate(tab === 'settings' ? '/settings' : '/inbox')}
            />
            {selectedId && !isSettings ? (
                <div className="fixed inset-0 z-40 flex flex-col bg-[var(--ios-surface)]">
                    <MessageReader emailId={selectedId} onBack={closeReader} onDeleted={closeReader} />
                </div>
            ) : null}
        </div>
    );
}

function InboxRoute() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const readerColumn = useMediaQuery(`(min-width: ${READER_COLUMN_MIN_WIDTH}px)`);
    const split = useMediaQuery(`(min-width: ${SPLIT_MIN_WIDTH}px)`);
    const folder = parseFolder(params.get('folder'));
    const selectedId = params.get('id');
    const { onUnreadChange } = useOutletContext<{ onUnreadChange: (value: number) => void }>();

    return (
        <InboxPage
            folder={folder}
            selectedId={selectedId}
            onSelect={(id) => {
                if (!id) {
                    const next = new URLSearchParams(params);
                    next.delete('id');
                    navigate({ pathname: '/inbox', search: next.toString() });
                    return;
                }
                navigate(`/inbox?folder=${folder}&id=${id}`);
            }}
            readerColumn={readerColumn}
            hasSidebar={split}
            onUnreadChange={onUnreadChange}
        />
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
            <AppProvider value={{ me: data, refreshMe: reload }}>
                <Routes>
                    <Route element={<Layout />}>
                        <Route path="/" element={<Navigate to="/inbox" replace />} />
                        <Route path="/inbox" element={<InboxRoute />} />
                        <Route path="/mail/:id" element={<MailPage />} />
                        <Route path="/settings" element={<Outlet />}>
                            <Route index element={<SettingsHub />} />
                            <Route path="white" element={<AddressListPage type="white" />} />
                            <Route path="block" element={<AddressListPage type="block" />} />
                            <Route path="forwarding" element={<ForwardingPage />} />
                            <Route path="summaries" element={<SummariesPage />} />
                            <Route path="handling" element={<HandlingPage />} />
                            <Route path="bot" element={<BotPage />} />
                            <Route path="*" element={<Navigate to="/settings" replace />} />
                        </Route>
                        <Route path="*" element={<Navigate to="/inbox" replace />} />
                    </Route>
                </Routes>
            </AppProvider>
        </KonstaApp>
    );
}

/** Root application: iOS Mail style shell with hash-based routing. */
export function App() {
    return (
        <HashRouter>
            <AppInner />
        </HashRouter>
    );
}
