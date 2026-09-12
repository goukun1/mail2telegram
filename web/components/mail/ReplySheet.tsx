import { useState } from 'react';
import { Block, Button, List, ListInput, Sheet } from 'konsta/react';
import { api } from '../../api/client';

export interface ReplySheetProps {
    opened: boolean;
    emailId: string;
    onClose: () => void;
}

/** Bottom sheet used to compose a reply through the Resend API. */
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
            <Block className="!my-2">
                <h2 className="mb-2 text-[17px] font-semibold">Reply</h2>
                <List strongIos outlineIos className="!my-0">
                    <ListInput
                        type="textarea"
                        input={
                            <textarea
                                value={text}
                                onChange={event => setText(event.target.value)}
                                placeholder="Write your reply…"
                                rows={6}
                                className="w-full resize-none bg-transparent text-[15px] outline-none"
                            />
                        }
                    />
                </List>
                {error ? <div className="mt-2 text-[13px] text-red-600">{error}</div> : null}
                <div className="mt-4 flex gap-2">
                    <Button rounded tonal onClick={close} disabled={sending}>Cancel</Button>
                    <Button rounded onClick={send} disabled={sending || !text.trim()}>
                        {sending ? 'Sending…' : 'Send'}
                    </Button>
                </div>
            </Block>
        </Sheet>
    );
}
