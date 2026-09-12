import type { ComponentType } from 'react';
import { GearIcon, MailIcon } from '../components/ios/Icons';

export interface MessageTabBarProps {
    active: 'inbox' | 'settings';
    unread: number;
    onChange: (tab: 'inbox' | 'settings') => void;
}

interface Tab {
    key: 'inbox' | 'settings';
    label: string;
    Icon: ComponentType<{ size?: number }>;
}

const TABS: Tab[] = [
    { key: 'inbox', label: 'Mail', Icon: MailIcon },
    { key: 'settings', label: 'Settings', Icon: GearIcon },
];

/** iOS style bottom tab bar with the unread badge on Mail. */
export function MessageTabBar({ active, unread, onChange }: MessageTabBarProps) {
    return (
        <div className="ios-tabbar">
            {TABS.map(({ key, label, Icon }) => {
                const selected = active === key;
                return (
                    <button
                        key={key}
                        type="button"
                        className="ios-tabbar__item"
                        style={{ color: selected ? 'var(--ios-blue)' : 'var(--ios-gray)' }}
                        onClick={() => onChange(key)}
                    >
                        <span className="relative">
                            <Icon size={26} />
                            {key === 'inbox' && unread > 0 ? <span className="ios-tabbar__badge">{unread > 99 ? '99+' : unread}</span> : null}
                        </span>
                        <span className="ios-tabbar__label">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
