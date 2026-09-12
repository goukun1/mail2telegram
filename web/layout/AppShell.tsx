import type { ReactNode } from 'react';
import type { Folder } from '../types';
import { useDarkMode } from '../hooks/useTheme';
import { Sidebar } from './Sidebar';

export interface AppShellProps {
    regular: boolean;
    folder: Folder;
    unread: number;
    onFolderChange: (folder: Folder) => void;
    onOpenSettings: () => void;
    children: ReactNode;
}

/** Layout frame: sidebar on wide screens, plain content on phones. */
export function AppShell({ regular, folder, unread, onFolderChange, onOpenSettings, children }: AppShellProps) {
    const dark = useDarkMode();

    if (!regular) {
        return <div className="app-shell">{children}</div>;
    }

    return (
        <div className="app-shell">
            <div className="app-shell__body">
                <div className="split-view--sidebar">
                    <Sidebar
                        folder={folder}
                        unread={unread}
                        onFolderChange={onFolderChange}
                        onOpenSettings={onOpenSettings}
                    />
                </div>
                <div className={`min-w-0 flex-1 ${dark ? 'dark' : ''}`}>{children}</div>
            </div>
        </div>
    );
}
