import type { ComponentType } from 'react';
import type { Folder } from '../types';
import { ChevronRightIcon, GearIcon, InboxIcon, SentIcon, SpamIcon, TrashIcon } from '../components/ios/Icons';

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

export interface SidebarProps {
    folder: Folder;
    unread: number;
    isSettings: boolean;
    onSelectFolder: (folder: Folder) => void;
    onOpenSettings: () => void;
}

/**
 * iPadOS Mailboxes sidebar: mailboxes on top and a Settings button pinned to the
 * bottom left. Used on desktop clients, which never show the phone tab bar.
 */
export function Sidebar({ folder, unread, isSettings, onSelectFolder, onOpenSettings }: SidebarProps) {
    return (
        <nav className="ipad-sidebar">
            <div className="ipad-sidebar__scroll">
                <div className="ipad-sidebar__title">Mailboxes</div>
                {MAILBOXES.map(({ key, label, color, Icon }) => {
                    const selected = !isSettings && folder === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            className="mailbox-row w-full text-left"
                            style={{ background: selected ? 'rgba(120, 120, 128, 0.14)' : 'transparent', border: 0 }}
                            onClick={() => onSelectFolder(key)}
                        >
                            <span className="mailbox-row__icon" style={{ background: color }}><Icon size={17} /></span>
                            <span className="mailbox-row__label" style={{ fontWeight: selected ? 600 : 400 }}>{label}</span>
                            {key === 'inbox' && unread > 0 ? <span className="mailbox-row__count">{unread}</span> : null}
                            <span className="mailbox-row__chevron"><ChevronRightIcon size={15} /></span>
                        </button>
                    );
                })}
            </div>
            <div className="ipad-sidebar__footer">
                <button
                    type="button"
                    className={`ipad-sidebar__settings ${isSettings ? 'is-active' : ''}`}
                    onClick={onOpenSettings}
                >
                    <GearIcon size={18} />
                    <span>Settings</span>
                </button>
            </div>
        </nav>
    );
}
