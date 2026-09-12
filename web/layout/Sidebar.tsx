import type { Folder } from '../types';
import { List, ListItem, ListButton } from 'konsta/react';

export const FOLDERS: { key: Folder; label: string; icon: string }[] = [
    { key: 'inbox', label: 'Inbox', icon: 'tray' },
    { key: 'spam', label: 'Spam', icon: 'exclamationmark.octagon' },
    { key: 'trash', label: 'Trash', icon: 'trash' },
    { key: 'sent', label: 'Sent', icon: 'paperplane' },
];

export interface SidebarProps {
    folder: Folder;
    unread: number;
    onFolderChange: (folder: Folder) => void;
    onOpenSettings: () => void;
}

function FolderIcon({ name, active }: { name: string; active: boolean }) {
    return (
        <span
            className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md text-[13px] font-semibold"
            style={{
                background: active ? 'var(--tg-theme-link-color, #007aff)' : 'color-mix(in srgb, currentColor 12%, transparent)',
                color: active ? '#fff' : 'inherit',
            }}
            aria-hidden
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

export function Sidebar({ folder, unread, onFolderChange, onOpenSettings }: SidebarProps) {
    return (
        <div className="py-3">
            <List nested>
                {FOLDERS.map(item => (
                    <ListItem
                        key={item.key}
                        link
                        media={<FolderIcon name={item.icon} active={folder === item.key} />}
                        title={item.label}
                        after={item.key === 'inbox' && unread > 0
                            ? <span className="rounded-full bg-[var(--tg-theme-link-color,#007aff)] px-2 py-[1px] text-[12px] font-semibold text-white">{unread}</span>
                            : undefined}
                        onClick={() => onFolderChange(item.key)}
                        className={folder === item.key ? 'font-semibold' : ''}
                    />
                ))}
            </List>
            <List nested className="mt-4">
                <ListButton onClick={onOpenSettings}>Settings</ListButton>
            </List>
        </div>
    );
}
