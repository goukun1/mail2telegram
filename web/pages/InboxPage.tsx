import type { Email, EmailListResponse, Folder } from '../types';
import { Preloader, Searchbar, Segmented, SegmentedButton } from 'konsta/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { CloseIcon, SearchIcon } from '../components/ios/Icons';
import { MessageList } from '../components/ios/MessageList';
import { MessageReader } from '../components/ios/MessageReader';
import { NavBar } from '../components/ios/NavBar';
import { PullToRefresh } from '../components/ios/PullToRefresh';
import { useAsync } from '../hooks/useAsync';

const PAGE_SIZE = 30;

const FOLDER_TITLES: Record<Folder, string> = {
    inbox: 'Inbox',
    spam: 'Spam',
    trash: 'Trash',
    sent: 'Sent',
};

const FOLDER_HINTS: Record<Folder, string> = {
    inbox: 'Messages you receive will appear here.',
    spam: 'Junk mail will appear here.',
    trash: 'Messages you delete will appear here.',
    sent: 'Replies you send will appear here.',
};

export interface InboxPageProps {
    folder: Folder;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    /** The window is wide enough for the reader to be its own column. */
    readerColumn: boolean;
    /** The layout provides a mailboxes sidebar, so the list needs no Close. */
    hasSidebar: boolean;
    onUnreadChange: (unread: number) => void;
}

/** iOS Mail message list with search and folder filters. */
export function InboxPage({ folder, selectedId, onSelect, readerColumn, hasSidebar, onUnreadChange }: InboxPageProps) {
    const [query, setQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
    const [searching, setSearching] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLDivElement | null>(null);

    const { data, loading, error, reload } = useAsync<EmailListResponse>(
        () => api.listEmails({
            folder,
            q: appliedQuery || undefined,
            limit,
            unread: filter === 'unread' ? true : undefined,
            starred: filter === 'starred' ? true : undefined,
        }),
        [folder, appliedQuery, limit, filter],
    );

    const emails = data?.emails ?? [];
    const hasMore = data ? emails.length < data.total : false;

    useEffect(() => {
        if (data?.unread !== undefined) {
            onUnreadChange(data.unread);
        }
    }, [data?.unread, onUnreadChange]);

    // Telegram parks the WebView in the background; picking the chat back up
    // should show the mail that arrived meanwhile.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                reload();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [reload]);

    // Swipe-to-delete: move the message to trash (or erase it when already
    // there) and drop the selection if the open message was the one removed.
    const removeEmail = async (email: Email) => {
        try {
            await api.deleteEmail(email.id);
        } catch {
            return;
        }
        if (email.id === selectedId) {
            onSelect(null);
        }
        reload();
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setAppliedQuery(query);
            setLimit(PAGE_SIZE);
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    // Open search with the field focused, like iOS Mail; cancelling clears the
    // active query so the list never keeps filtering invisibly.
    useEffect(() => {
        if (!searching) {
            return;
        }
        searchRef.current?.querySelector('input')?.focus();
    }, [searching]);

    const closeSearch = () => {
        setSearching(false);
        setQuery('');
        setAppliedQuery('');
    };

    // Reset the scroll position when the folder, query or filter changes.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [folder, appliedQuery, filter]);

    const empty = useMemo(() => {
        if (appliedQuery) {
            return { title: 'No Results', subtitle: `No messages matching \u201C${appliedQuery}\u201D.` };
        }
        if (filter === 'unread') {
            return { title: 'No Unread Mail', subtitle: '' };
        }
        if (filter === 'starred') {
            return { title: 'No Starred Mail', subtitle: '' };
        }
        return { title: 'No Mail', subtitle: FOLDER_HINTS[folder] };
    }, [appliedQuery, filter, folder]);

    const listColumn = (
        <div className="split-column">
            <NavBar
                title={FOLDER_TITLES[folder]}
                // On the phone the root list offers Close; while a message is
                // open the reader owns the native button instead, so the two
                // never subscribe at the same time.
                close={!hasSidebar && !selectedId}
                right={(
                    <button
                        type="button"
                        aria-label={searching ? 'Close search' : 'Search'}
                        className="bar-button icon-hit p-1 text-[var(--ios-blue)]"
                        onClick={() => (searching ? closeSearch() : setSearching(true))}
                    >
                        {searching ? <CloseIcon size={20} /> : <SearchIcon size={22} />}
                    </button>
                )}
            />
            <div className="list-header">
                {searching ? (
                    <div className="px-2 py-1" ref={searchRef}>
                        <Searchbar
                            placeholder="Search"
                            value={query}
                            onChange={(e: any) => setQuery(e.target.value)}
                            onClear={() => {
                                setQuery('');
                                setAppliedQuery('');
                            }}
                            disableButton
                        />
                    </div>
                ) : null}
                <div className="px-3 pb-2 pt-2">
                    <Segmented strong className="ios-segmented">
                        <SegmentedButton active={filter === 'all'} onClick={() => setFilter('all')}>All</SegmentedButton>
                        <SegmentedButton active={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</SegmentedButton>
                        <SegmentedButton active={filter === 'starred'} onClick={() => setFilter('starred')}>Starred</SegmentedButton>
                    </Segmented>
                </div>
            </div>
            <PullToRefresh className="page-scroll" scrollRef={scrollRef} onRefresh={reload}>
                {loading && emails.length === 0 ? (
                    <div className="spin-center"><Preloader /></div>
                ) : error ? (
                    <div className="reader-empty">
                        <div>
                            <p className="mb-3">{error.message}</p>
                            <button type="button" className="text-button" onClick={reload}>Try Again</button>
                        </div>
                    </div>
                ) : emails.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state__title">{empty.title}</div>
                        {empty.subtitle ? <div className="empty-state__subtitle">{empty.subtitle}</div> : null}
                    </div>
                ) : (
                    <MessageList
                        emails={emails}
                        selectedId={selectedId}
                        onSelect={(email: Email) => onSelect(email.id)}
                        onDelete={removeEmail}
                        onEndReached={hasMore ? () => setLimit(value => value + PAGE_SIZE) : undefined}
                    />
                )}
            </PullToRefresh>
        </div>
    );

    // When the window is wide enough the reader becomes its own column beside
    // the list; otherwise the list fills the content area and the compact
    // layout shows the reader as an overlay.
    if (!readerColumn) {
        return listColumn;
    }

    return (
        <div className="split-view split-view--two">
            {listColumn}
            <div className="split-column">
                {selectedId ? (
                    <MessageReader
                        key={selectedId}
                        emailId={selectedId}
                        onChanged={reload}
                        onDeleted={() => onSelect(null)}
                    />
                ) : (
                    <div className="reader-empty">No Message Selected</div>
                )}
            </div>
        </div>
    );
}
