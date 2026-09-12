import type { ForwardableEmailMessage, ReadableStream, ReadableWritablePair } from '@cloudflare/workers-types';
import type { RawEmail } from 'postal-mime';
import type { MaxEmailSizePolicy, ParsedAttachment, ParsedEmail, ParsedEmailResult } from '../types';
import { convert } from 'html-to-text';
import PostalMime from 'postal-mime';

function truncateStream(stream: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
    let bytesRead = 0;
    const tran = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
            if (bytesRead >= maxBytes) {
                controller.terminate();
                return;
            }
            const remainingBytes = maxBytes - bytesRead;
            if (chunk.length <= remainingBytes) {
                controller.enqueue(chunk);
                bytesRead += chunk.length;
            } else {
                const limitedChunk = chunk.slice(0, remainingBytes);
                controller.enqueue(limitedChunk);
                bytesRead += remainingBytes;
                controller.terminate();
            }
        },
    }) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
    return stream.pipeThrough(tran);
}

function normalizeAttachmentContent(content: ArrayBuffer | string | undefined): ArrayBuffer {
    if (content === undefined) {
        return new ArrayBuffer(0);
    }
    if (typeof content === 'string') {
        return new TextEncoder().encode(content).buffer as ArrayBuffer;
    }
    return content;
}

export async function parseEmail(
    message: ForwardableEmailMessage,
    maxSize: number,
    maxSizePolicy: MaxEmailSizePolicy,
): Promise<ParsedEmailResult> {
    const id = crypto.randomUUID();
    const base: ParsedEmail = {
        messageId: message.headers.get('Message-ID')?.trim() || id,
        from: message.from,
        fromName: null,
        to: message.to,
        cc: null,
        bcc: null,
        subject: message.headers.get('Subject') || '',
        text: '',
        html: null,
        inReplyTo: null,
        references: [],
        date: new Date().toISOString(),
        rawHeaders: null,
        attachments: [],
    };
    let isTruncate = false;
    let emailRaw = message.raw;
    try {
        const policy = message.rawSize > maxSize ? maxSizePolicy : 'continue';
        if (policy === 'unhandled') {
            const notice = `The original size of the email was ${message.rawSize} bytes, which exceeds the maximum size of ${maxSize} bytes.`;
            base.text = notice;
            base.html = notice;
            return { ...base, truncated: false, unhandled: true, rawSize: message.rawSize };
        }
        if (policy === 'truncate') {
            isTruncate = true;
            emailRaw = truncateStream(message.raw, maxSize);
        }
        const parser = new PostalMime();
        const email = await parser.parse(emailRaw as unknown as RawEmail);
        base.subject = email.subject || base.subject;
        base.messageId = email.messageId?.trim() || base.messageId;
        base.from = email.from?.address || base.from;
        base.fromName = email.from?.name || null;
        base.to = email.to?.map(addr => addr.address).filter(Boolean).join(', ') || base.to;
        base.cc = email.cc?.map(addr => addr.address).filter(Boolean).join(', ') || null;
        base.bcc = email.bcc?.map(addr => addr.address).filter(Boolean).join(', ') || null;
        base.date = email.date ? new Date(email.date).toISOString() : base.date;
        base.inReplyTo = email.inReplyTo?.trim() || null;
        base.references = (email.references || '').split(/\s+/).map(ref => ref.trim()).filter(Boolean);
        base.rawHeaders = JSON.stringify(Object.fromEntries((email.headers || []).map(header => [header.key, header.value])));
        base.html = email.html || null;
        base.text = email.text || '';
        if (base.html && !base.text) {
            base.text = convert(base.html, {});
        }
        base.attachments = (email.attachments || []).map((att): ParsedAttachment => ({
            filename: att.filename || 'attachment',
            mimetype: att.mimeType || 'application/octet-stream',
            contentId: att.contentId || null,
            disposition: att.disposition || null,
            content: normalizeAttachmentContent(att.content as ArrayBuffer | string | undefined),
        }));
        if (isTruncate) {
            base.text += `\n\n[Truncated] The original size of the email was ${message.rawSize} bytes, which exceeds the maximum size of ${maxSize} bytes.`;
        }
    } catch (e) {
        const msg = `Error parsing email: ${(e as Error).message}`;
        base.text = msg;
        base.html = msg;
        base.attachments = [];
    }
    return { ...base, truncated: isTruncate, unhandled: false, rawSize: message.rawSize };
}
