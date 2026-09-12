import type { Email } from '../../types';
import { useCallback, useRef } from 'react';
import { formatListDate, senderLabel } from '../../lib/format';
import { StarIcon } from './Icons';

export interface MessageListProps {
    emails: Email[];
    selectedId?: string | null;
    onSelect: (email: Email) => void;
    onEndReached?: () => void;
}

/** A single iOS Mail message cell. */
function MessageRow({ email, selected, onSelect }: { email: Email; selected: boolean; onSelect: (email: Email) => void }) {
    const unread = email.is_read === 0;
    return (
        <div
            role="button"
            tabIndex={0}
            className={`message-row ${unread ? 'message-row--unread' : ''}`}
            style={selected ? { background: 'var(--ios-blue)', color: '#fff' } : undefined}
            onClick={() => onSelect(email)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    onSelect(email);
                }
            }}
        >
            <span className={`message-row__dot ${unread ? '' : 'message-row__dot--read'}`}>
                <span />
            </span>
            <span className="message-row__body">
                <span className="message-row__top">
                    <span className="message-row__sender" style={selected ? { color: '#fff' } : undefined}>
                        {senderLabel(email)}
                    </span>
                    <span className="message-row__time" style={selected ? { color: 'rgba(255,255,255,0.85)' } : undefined}>
                        {email.is_starred ? <StarIcon size={13} className="message-row__star" /> : null}
                        {formatListDate(email.date)}
                    </span>
                </span>
                <span className="message-row__subject" style={selected ? { color: '#fff' } : undefined}>
                    {email.subject || '(no subject)'}
                </span>
                <span className="message-row__preview" style={selected ? { color: 'rgba(255,255,255,0.85)' } : undefined}>
                    {email.body_text || ''}
                </span>
            </span>
        </div>
    );
}

/** Scrolling list of messages with infinite loading. */
export function MessageList({ emails, selectedId, onSelect, onEndReached }: MessageListProps) {
    const observer = useRef<IntersectionObserver | null>(null);
    const sentinel = useCallback((node: HTMLDivElement | null) => {
        observer.current?.disconnect();
        if (!node || !onEndReached) {
            return;
        }
        observer.current = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                onEndReached();
            }
        }, { rootMargin: '300px' });
        observer.current.observe(node);
    }, [onEndReached]);

    return (
        <div>
            {emails.map(email => (
                <MessageRow
                    key={email.id}
                    email={email}
                    selected={email.id === selectedId}
                    onSelect={onSelect}
                />
            ))}
            {onEndReached && emails.length > 0 ? <div ref={sentinel} style={{ height: 1 }} /> : null}
        </div>
    );
}
