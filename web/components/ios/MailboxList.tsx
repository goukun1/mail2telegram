import type { ComponentType } from 'react';
import type { Folder } from '../../types';
import { ChevronRightIcon, GearIcon, InboxIcon, SentIcon, SpamIcon, TrashIcon } from './Icons';

interface Mailbox {
    key: Folder;
    label: string;
    color: string;
    Icon: ComponentType<{ size?: number }>;
}

export const MAILBOXES: Mailbox[] = [
    { key: 'inbox', label: 'Inbox', color: '#007aff', Icon: InboxIcon },
    { key: 'spam', label: 'Spam', color: '#ff9500', Icon: SpamIcon },
    { key: 'trash', label: 'Trash', color: '#8e8e93', Icon: TrashIcon },
    { key: 'sent', label: 'Sent', color: '#34c759', Icon: SentIcon },
];

export interface MailboxListProps {
    folder: Folder;
    unread: number;
    onSelect: (folder: Folder) => void;
    onOpenSettings: () => void;
}

/** iPadOS Mailboxes pane. */
export function MailboxList({ folder, unread, onSelect, onOpenSettings }: MailboxListProps) {
    return (
        <div className="mailbox-list">
            {MAILBOXES.map(({ key, label, color, Icon }) => (
                <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    className="mailbox-row"
                    style={folder === key ? { background: 'rgba(120, 120, 128, 0.12)' } : undefined}
                    onClick={() => onSelect(key)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            onSelect(key);
                        }
                    }}
                >
                    <span className="mailbox-row__icon" style={{ background: color }}>
                        <Icon size={17} />
                    </span>
                    <span className="mailbox-row__label" style={folder === key ? { fontWeight: 600 } : undefined}>{label}</span>
                    {key === 'inbox' && unread > 0 ? <span className="mailbox-row__count">{unread}</span> : null}
                    <span className="mailbox-row__chevron"><ChevronRightIcon size={16} /></span>
                </div>
            ))}
            <div className="mailbox-row" role="button" tabIndex={0} onClick={onOpenSettings}>
                <span className="mailbox-row__icon" style={{ background: '#8e8e93' }}><GearIcon size={17} /></span>
                <span className="mailbox-row__label">Settings</span>
                <span className="mailbox-row__chevron"><ChevronRightIcon size={16} /></span>
            </div>
        </div>
    );
}
