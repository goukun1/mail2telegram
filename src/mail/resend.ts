import type { EmailRecord } from '../types';

export interface ReplyOptions {
    /** Optional reply subject override. */
    subject?: string;
}

export async function replyToEmail(
    token: string,
    email: EmailRecord,
    message: string,
    options: ReplyOptions = {},
): Promise<void> {
    const subject = options.subject || (email.subject.startsWith('Re: ') ? email.subject : `Re: ${email.subject}`);
    await sendEmail(token, email.recipient, [email.sender], subject, message);
}

export async function sendEmail(
    token: string,
    from: string,
    to: string[],
    subject: string,
    text: string,
): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to,
            subject,
            text,
        }),
    });
    if (!response.ok) {
        throw new Error(`Resend API request failed: ${response.status}`);
    }
}
