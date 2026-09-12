import type { Attachment } from '../../types';
import { List, ListItem } from 'konsta/react';
import { useState } from 'react';
import { fetchAttachmentBlob } from '../../api/client';
import { formatBytes } from '../../lib/format';

export interface AttachmentListProps {
    emailId: string;
    attachments: Attachment[];
}

/** Lists attachments and downloads them through the authenticated API. */
export function AttachmentList({ emailId, attachments }: AttachmentListProps) {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (attachments.length === 0) {
        return null;
    }

    const download = async (attachment: Attachment) => {
        setBusy(attachment.id);
        setError(null);
        try {
            const blob = await fetchAttachmentBlob(emailId, attachment.id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = attachment.filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div>
            <List strongIos outlineIos>
                {attachments.map(attachment => (
                    <ListItem
                        key={attachment.id}
                        link
                        onClick={() => download(attachment)}
                        innerChildren={(
                            <div className="attachment-row w-full">
                                <span className="attachment-row__name text-[15px]">{attachment.filename}</span>
                                <span className="shrink-0 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                                    {busy === attachment.id ? 'Downloading…' : formatBytes(attachment.size)}
                                </span>
                            </div>
                        )}
                    />
                ))}
            </List>
            {error ? <div className="settings-hint text-red-600">{error}</div> : null}
        </div>
    );
}
