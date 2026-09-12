import type { EmailDetailResponse } from '../../types';
import { Block, Button, Card, Preloader } from 'konsta/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useDarkMode } from '../../hooks/useTheme';
import { formatBytes, formatFullDate, senderLabel } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { buildEmailDocument } from '../../lib/sanitize';
import { StatePlaceholder } from '../common/Placeholder';
import { AttachmentList } from './AttachmentList';
import { ReplySheet } from './ReplySheet';

export interface MailReaderProps {
    emailId: string;
    onChanged?: () => void;
    onDeleted?: () => void;
}

type BodyMode = 'html' | 'text';

export function MailReader({ emailId, onChanged, onDeleted }: MailReaderProps) {
    const dark = useDarkMode();
    const { data, loading, error, reload, setData } = useAsync<EmailDetailResponse>(
        () => api.getEmail(emailId),
        [emailId],
    );
    const [mode, setMode] = useState<BodyMode>('html');
    const [summary, setSummary] = useState<string | null>(null);
    const [summaryBusy, setSummaryBusy] = useState(false);
    const [replyOpen, setReplyOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const email = data?.email;

    // Reset per-email UI state when the selection changes.
    useEffect(() => {
        setMode('html');
        setSummary(null);
        setActionError(null);
    }, [emailId]);

    // Mark as read once loaded.
    useEffect(() => {
        if (email && email.is_read === 0) {
            api.updateEmail(email.id, { isRead: true })
                .then(() => {
                    setData(previous => (previous ? { ...previous, email: { ...previous.email, is_read: 1 } } : previous));
                    onChanged?.();
                })
                .catch(() => {});
        }
    }, [email?.id, email?.is_read]);

    const document = useMemo(() => {
        if (!email?.body_html) {
            return null;
        }
        return buildEmailDocument(email.body_html, dark);
    }, [email?.body_html, dark]);

    if (loading && !data) {
        return <div className="flex h-full items-center justify-center"><Preloader /></div>;
    }
    if (error) {
        return <StatePlaceholder error={error} onRetry={reload} />;
    }
    if (!email || !data) {
        return <StatePlaceholder empty emptyText="Email not found." />;
    }

    const toggleStar = async () => {
        const next = email.is_starred === 0;
        haptic.selection();
        await api.updateEmail(email.id, { isStarred: next });
        setData(previous => (previous ? { ...previous, email: { ...previous.email, is_starred: next ? 1 : 0 } } : previous));
        onChanged?.();
    };

    const toggleRead = async () => {
        const markUnread = email.is_read === 1;
        await api.updateEmail(email.id, { isRead: !markUnread });
        setData(previous => (previous ? { ...previous, email: { ...previous.email, is_read: markUnread ? 0 : 1 } } : previous));
        onChanged?.();
    };

    const remove = async () => {
        haptic.impact();
        await api.deleteEmail(email.id);
        onDeleted?.();
    };

    const runSummary = async () => {
        setSummaryBusy(true);
        setActionError(null);
        try {
            const result = await api.summarize(email.id);
            setSummary(result.summary);
        } catch (e) {
            setActionError((e as Error).message);
        } finally {
            setSummaryBusy(false);
        }
    };

    const hasHtml = Boolean(email.body_html);
    const showHtml = mode === 'html' && hasHtml && document;

    return (
        <div className="reader">
            <div className="reader__header">
                <div className="reader__meta">
                    <div className="flex items-start justify-between gap-3">
                        <h1 className="reader__subject">{email.subject || '(no subject)'}</h1>
                        <button
                            type="button"
                            onClick={toggleStar}
                            aria-label={email.is_starred ? 'Unstar' : 'Star'}
                            className={`shrink-0 rounded-full px-2 py-1 text-[20px] leading-none ${email.is_starred ? 'text-amber-500' : 'text-[var(--tg-theme-hint-color,#8e8e93)]'}`}
                        >
                            {email.is_starred ? '★' : '☆'}
                        </button>
                    </div>
                    <div className="reader__from">
                        {senderLabel(email)}
                        <span className="text-[var(--tg-theme-hint-color,#8e8e93)]">{` <${email.sender}>`}</span>
                    </div>
                    <div className="reader__to">
                        {`To: ${email.recipient}`}
                        {email.cc ? ` · Cc: ${email.cc}` : ''}
                    </div>
                    <div className="reader__to mt-1">
                        {formatFullDate(email.date)}
                        {email.size ? ` · ${formatBytes(email.size)}` : ''}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {data.summaryEnabled ? (
                            <Button small rounded tonal onClick={runSummary} disabled={summaryBusy}>
                                {summaryBusy ? 'Summarizing…' : 'Summary'}
                            </Button>
                        ) : null}
                        {data.resendEnabled ? (
                            <Button small rounded tonal onClick={() => setReplyOpen(true)}>Reply</Button>
                        ) : null}
                        <Button small rounded tonal onClick={toggleRead}>
                            {email.is_read === 0 ? 'Mark read' : 'Mark unread'}
                        </Button>
                        <Button small rounded tonal className="!text-red-600" onClick={remove}>Delete</Button>
                    </div>
                    {actionError ? <div className="settings-hint text-red-600">{actionError}</div> : null}
                    {summary ? (
                        <Card raised className="!m-0 mt-3">
                            <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{summary}</div>
                        </Card>
                    ) : null}
                </div>
            </div>

            <div className="reader__body">
                {hasHtml && email.body_text ? (
                    <div className="flex gap-2 px-4 pt-3">
                        <button
                            type="button"
                            onClick={() => setMode('html')}
                            className={`rounded-full px-3 py-1 text-[13px] ${mode === 'html' ? 'bg-[var(--tg-theme-link-color,#007aff)] text-white' : 'bg-black/5'}`}
                        >
                            HTML
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('text')}
                            className={`rounded-full px-3 py-1 text-[13px] ${mode === 'text' ? 'bg-[var(--tg-theme-link-color,#007aff)] text-white' : 'bg-black/5'}`}
                        >
                            Text
                        </button>
                    </div>
                ) : null}
                {showHtml ? (
                    <iframe
                        title="Email content"
                        className="reader__frame"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        srcDoc={document ?? undefined}
                    />
                ) : (
                    <div className="reader__text">{email.body_text || 'No content.'}</div>
                )}
                <Block className="!my-2">
                    <AttachmentList emailId={email.id} attachments={data.attachments} />
                </Block>
            </div>

            <ReplySheet
                opened={replyOpen}
                emailId={email.id}
                onClose={() => setReplyOpen(false)}
            />
        </div>
    );
}
