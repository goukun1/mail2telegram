import type { Email, EmailListResponse, Folder } from '../types';
import { Searchbar, Segmented, SegmentedButton } from 'konsta/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { CloseIcon, SearchIcon } from '../components/ios/Icons';
import { MAILBOXES } from '../components/ios/MailboxList';
import { MessageList } from '../components/ios/MessageList';
import { MessageReader } from '../components/ios/MessageReader';
import { NavBar } from '../components/ios/NavBar';
import { useAsync } from '../hooks/useAsync';

const PAGE_SIZE = 30;

const FOLDER_TITLES: Record<Folder, string> = {
    inbox: 'Inbox',
    spam: 'Spam',
    trash: 'Trash',
    sent: 'Sent',
};

export interface InboxPageProps {
    folder: Folder;
    onFolderChange: (folder: Folder) => void;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    /** Show the Mailboxes pane (iPadOS three column layout). */
    showSidebar: boolean;
    onUnreadChange: (unread: number) => void;
}

/** iOS Mail message list with search and folder filters. */
export function InboxPage({ folder, onFolderChange, selectedId, onSelect, showSidebar, onUnreadChange }: InboxPageProps) {
    const [query, setQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');
    const [searching, setSearching] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);

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

    useEffect(() => {
        const timer = setTimeout(() => {
            setAppliedQuery(query);
            setLimit(PAGE_SIZE);
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    // Reset the scroll position when the folder, query or filter changes.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [folder, appliedQuery, filter]);

    const emptyText = useMemo(() => {
        if (appliedQuery) {
            return `No messages matching \u201C${appliedQuery}\u201D.`;
        }
        if (filter === 'unread') {
            return 'No Unread Messages';
        }
        if (filter === 'starred') {
            return 'No Starred Messages';
        }
        return `No Messages in ${FOLDER_TITLES[folder]}`;
    }, [appliedQuery, filter, folder]);

    const listColumn = (
        <div className="split-column">
            <NavBar
                title={FOLDER_TITLES[folder]}
                // On the phone the root list offers Close; while a message is
                // open the reader owns the native button instead, so the two
                // never subscribe at the same time.
                close={!showSidebar && !selectedId}
                right={(
                    <button
                        type="button"
                        aria-label={searching ? 'Close search' : 'Search'}
                        className="p-1 text-[var(--ios-blue)]"
                        onClick={() => setSearching(value => !value)}
                    >
                        {searching ? <CloseIcon size={20} /> : <SearchIcon size={22} />}
                    </button>
                )}
            />
            <div className="list-header">
                {searching ? (
                    <div className="px-2 py-1">
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
                <div className="overflow-x-auto px-3 pb-2 pt-2">
                    <Segmented className="w-max">
                        <SegmentedButton active={filter === 'all'} onClick={() => setFilter('all')}>All</SegmentedButton>
                        <SegmentedButton active={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</SegmentedButton>
                        <SegmentedButton active={filter === 'starred'} onClick={() => setFilter('starred')}>Starred</SegmentedButton>
                    </Segmented>
                </div>
            </div>
            <div className="page-scroll" ref={scrollRef}>
                {loading && emails.length === 0 ? (
                    <div className="spin-center"><span className="text-[var(--ios-gray)]">Loading…</span></div>
                ) : error ? (
                    <div className="reader-empty">
                        <div>
                            <p className="mb-3">{error.message}</p>
                            <button type="button" className="text-[var(--ios-blue)]" onClick={reload}>Try Again</button>
                        </div>
                    </div>
                ) : emails.length === 0 ? (
                    <div className="reader-empty">{emptyText}</div>
                ) : (
                    <MessageList
                        emails={emails}
                        selectedId={selectedId}
                        onSelect={(email: Email) => onSelect(email.id)}
                        onEndReached={hasMore ? () => setLimit(value => value + PAGE_SIZE) : undefined}
                    />
                )}
            </div>
        </div>
    );

    // iPadOS three column layout: mailboxes, list and reader side by side.
    if (showSidebar) {
        return (
            <div className="split-view split-view--three">
                <div className="split-column split-column--sidebar">
                    <div className="page-scroll">
                        <MailboxPane folder={folder} onFolderChange={onFolderChange} />
                    </div>
                </div>
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

    return listColumn;
}

function MailboxPane({ folder, onFolderChange }: { folder: Folder; onFolderChange: (folder: Folder) => void }) {
    return (
        <div>
            {MAILBOXES.map(({ key, label, color, Icon }) => (
                <button
                    key={key}
                    type="button"
                    className="mailbox-row w-full text-left"
                    style={{ background: folder === key ? 'rgba(120,120,128,0.14)' : 'transparent', border: 0 }}
                    onClick={() => onFolderChange(key)}
                >
                    <span className="mailbox-row__icon" style={{ background: color }}><Icon size={17} /></span>
                    <span className="mailbox-row__label" style={{ fontWeight: folder === key ? 600 : 400 }}>{label}</span>
                </button>
            ))}
        </div>
    );
}
