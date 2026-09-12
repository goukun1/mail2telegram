import { Tabbar, TabbarLink } from 'konsta/react';

export interface TabBarProps {
    active: 'inbox' | 'settings';
    unread: number;
    onChange: (tab: 'inbox' | 'settings') => void;
}

function TabIcon({ label, active }: { label: string; active: boolean }) {
    return (
        <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[12px] font-semibold"
            style={{
                background: active ? 'var(--tg-theme-link-color, #007aff)' : 'color-mix(in srgb, currentColor 14%, transparent)',
                color: active ? '#fff' : 'inherit',
            }}
            aria-hidden
        >
            {label}
        </span>
    );
}

export function TabBar({ active, unread, onChange }: TabBarProps) {
    return (
        <Tabbar labels icons className="left-0 bottom-0 fixed">
            <TabbarLink
                active={active === 'inbox'}
                onClick={() => onChange('inbox')}
                icon={<TabIcon label="In" active={active === 'inbox'} />}
                label={unread > 0 ? `Inbox (${unread})` : 'Inbox'}
            />
            <TabbarLink
                active={active === 'settings'}
                onClick={() => onChange('settings')}
                icon={<TabIcon label="St" active={active === 'settings'} />}
                label="Settings"
            />
        </Tabbar>
    );
}
