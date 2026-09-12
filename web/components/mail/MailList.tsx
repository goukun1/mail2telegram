import type { Email } from '../../types';
import { List, ListItem } from 'konsta/react';
import { formatListDate, initialOf, senderLabel } from '../../lib/format';

export interface MailListProps {
    emails: Email[];
    selectedId?: string;
    onSelect: (email: Email) => void;
    onEndReached?: () => void;
}

function RowMedia({ email, selected }: { email: Email; selected: boolean }) {
    return (
        <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-semibold"
            style={{
                background: selected ? 'var(--tg-theme-link-color, #007aff)' : 'color-mix(in srgb, currentColor 14%, transparent)',
                color: selected ? '#fff' : 'inherit',
            }}
            aria-hidden
        >
            {initialOf(senderLabel(email))}
        </span>
    );
}

export function MailList({ emails, selectedId, onSelect, onEndReached }: MailListProps) {
    return (
        <List strongIos outlineIos className="m-0">
            {emails.map((email) => {
                const selected = email.id === selectedId;
                const unread = email.is_read === 0;
                return (
                    <ListItem
                        key={email.id}
                        link
                        media={<RowMedia email={email} selected={selected} />}
                        onClick={() => onSelect(email)}
                        className={`mail-row items-start ${unread ? 'mail-row--unread' : ''}`}
                        innerChildren={(
                            <div className="flex w-full items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="mail-row__subject truncate text-[15px] font-medium">
                                            {senderLabel(email)}
                                        </span>
                                        <span className="shrink-0 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                                            {formatListDate(email.date)}
                                        </span>
                                    </div>
                                    <div className="mail-row__subject truncate text-[14px]">
                                        {email.subject || '(no subject)'}
                                    </div>
                                    <div className="mail-row__preview">
                                        {email.body_text || ''}
                                    </div>
                                </div>
                                <div className="mail-row__meta shrink-0 pt-1">
                                    {email.is_starred ? <span aria-label="Starred" className="text-[13px]">★</span> : null}
                                    {unread ? <span className="mail-row__unread-dot" aria-label="Unread" /> : null}
                                </div>
                            </div>
                        )}
                    />
                );
            })}
            {onEndReached && emails.length > 0 ? (
                <ListItem
                    title={<span className="block text-center text-[14px] text-[var(--tg-theme-link-color,#007aff)]">Load more</span>}
                    onClick={onEndReached}
                />
            ) : null}
        </List>
    );
}
