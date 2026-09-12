export interface SettingsNavProps {
    isSettings: boolean;
    onOpenInbox: () => void;
    onOpenSettings: () => void;
}

/** iPadOS sidebar switch between Mail and Settings. */
export function SettingsNav({ isSettings, onOpenInbox, onOpenSettings }: SettingsNavProps) {
    return (
        <div>
            <button
                type="button"
                className="mailbox-row w-full text-left"
                style={{ background: isSettings ? 'transparent' : 'rgba(120,120,128,0.14)', border: 0 }}
                onClick={onOpenInbox}
            >
                <span className="mailbox-row__label" style={{ fontWeight: isSettings ? 400 : 600 }}>Mail</span>
            </button>
            <button
                type="button"
                className="mailbox-row w-full text-left"
                style={{ background: isSettings ? 'rgba(120,120,128,0.14)' : 'transparent', border: 0 }}
                onClick={onOpenSettings}
            >
                <span className="mailbox-row__label" style={{ fontWeight: isSettings ? 600 : 400 }}>Settings</span>
            </button>
        </div>
    );
}
