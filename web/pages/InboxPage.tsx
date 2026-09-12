import type { EmailListResponse, Folder } from '../types';
import { useEffect, useState } from 'react';
import { Searchbar, Segmented, SegmentedButton } from 'konsta/react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { MailList } from '../components/mail/MailList';
import { MailReader } from '../components/mail/MailReader';
import { StatePlaceholder } from '../components/common/Placeholder';
import { FOLDERS } from '../layout/Sidebar';

const PAGE_SIZE = 30;

export interface InboxPageProps {
    folder: Folder;
    onFolderChange: (folder: Folder) => void;
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    regular: boolean;
    onUnreadChange: (unread: number) => void;
}

export function InboxPage({
    folder,
    onFolderChange,
    selectedId,
    onSelect,
    regular,
    onUnreadChange,
}: InboxPageProps) {
    const [query, setQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [filter, setFilter] = useState<'all' | 'unread' | 'starred'>('all');

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
    const totalUnread = data?.unread;

    useEffect(() => {
        if (totalUnread !== undefined) {
            onUnreadChange(totalUnread);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalUnread]);

    // Debounce the search box into the applied query.
    useEffect(() => {
        const timer = setTimeout(() => {
            setAppliedQuery(query);
            setLimit(PAGE_SIZE);
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    const listPane = (
        <div className="flex h-full flex-col">
            <div className="border-b border-black/5 px-2 pb-2 pt-2 dark:border-white/10">
                <Searchbar
                    placeholder="Search mail"
                    value={query}
                    onChange={(e: any) => setQuery(e.target.value)}
                    onClear={() => {
                        setQuery('');
                        setAppliedQuery('');
                    }}
                    disableButton
                />
                <div className="mt-2 overflow-x-auto px-1 pb-1">
                    <Segmented strong className="w-max">
                        {FOLDERS.map(item => (
                            <SegmentedButton
                                key={item.key}
                                active={folder === item.key}
                                onClick={() => onFolderChange(item.key)}
                            >
                                {item.label}
                            </SegmentedButton>
                        ))}
                    </Segmented>
                </div>
                <div className="mt-2 px-1">
                    <Segmented className="w-max">
                        <SegmentedButton active={filter === 'all'} onClick={() => setFilter('all')}>All</SegmentedButton>
                        <SegmentedButton active={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</SegmentedButton>
                        <SegmentedButton active={filter === 'starred'} onClick={() => setFilter('starred')}>Starred</SegmentedButton>
                    </Segmented>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <StatePlaceholder
                    loading={loading && emails.length === 0}
                    error={error}
                    empty={emails.length === 0}
                    emptyText="No mail in this folder."
                    onRetry={reload}
                >
                    <MailList
                        emails={emails}
                        selectedId={selectedId ?? undefined}
                        onSelect={email => onSelect(email.id)}
                        onEndReached={hasMore ? () => setLimit(value => value + PAGE_SIZE) : undefined}
                    />
                </StatePlaceholder>
            </div>
        </div>
    );

    if (!regular) {
        return listPane;
    }

    return (
        <div className="split-view--two">
            <div className="split-pane">{listPane}</div>
            {selectedId ? (
                <div className="split-pane">
                    <MailReader
                        key={selectedId}
                        emailId={selectedId}
                        onChanged={reload}
                        onDeleted={() => onSelect(null)}
                    />
                </div>
            ) : (
                <div className="split-pane reader-empty">Select an email to read</div>
            )}
        </div>
    );
}
