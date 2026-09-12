import { Block, Button, Sheet } from 'konsta/react';
import { useState } from 'react';
import { api } from '../../api/client';

export interface ReplySheetProps {
    opened: boolean;
    emailId: string;
    onClose: () => void;
}

/** iOS Mail style compose sheet, sending replies through the Resend API. */
export function ReplySheet({ opened, emailId, onClose }: ReplySheetProps) {
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = () => {
        if (sending) {
            return;
        }
        setText('');
        setError(null);
        onClose();
    };

    const send = async () => {
        if (!text.trim()) {
            return;
        }
        setSending(true);
        setError(null);
        try {
            await api.reply(emailId, text);
            setText('');
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSending(false);
        }
    };

    return (
        <Sheet opened={opened} onBackdropClick={close} className="pb-safe">
            <div className="px-4 pt-2">
                <div className="mb-2 flex items-center justify-between">
                    <button type="button" className="text-[17px] text-[var(--ios-blue)]" onClick={close} disabled={sending}>
                        Cancel
                    </button>
                    <span className="text-[17px] font-semibold">Reply</span>
                    <button
                        type="button"
                        className="text-[17px] font-semibold text-[var(--ios-blue)] disabled:opacity-40"
                        onClick={send}
                        disabled={sending || !text.trim()}
                    >
                        {sending ? 'Sending' : 'Send'}
                    </button>
                </div>
                <textarea
                    value={text}
                    onChange={event => setText(event.target.value)}
                    placeholder="Write your reply…"
                    rows={7}
                    autoFocus
                    className="w-full resize-none rounded-xl bg-black/5 p-3 text-[16px] leading-relaxed outline-none dark:bg-white/10"
                />
                {error ? <div className="mt-2 text-[13px] text-[#ff3b30]">{error}</div> : null}
                <Block className="!mx-0 !my-3 !px-0">
                    <Button rounded large className="w-full" onClick={send} disabled={sending || !text.trim()}>
                        {sending ? 'Sending…' : 'Send Reply'}
                    </Button>
                </Block>
            </div>
        </Sheet>
    );
}
