import type { R2Bucket } from '@cloudflare/workers-types';
import type { Dao, EmailCleanupTarget } from './index';
import { isR2Pointer } from '../mail/body';

/** Emails handled per scan pass; keeps each request inside worker subrequest limits. */
const SCAN_BATCH = 80;
const MAX_SCANS = 5;
const R2_DELETE_BATCH = 100;

export interface CleanupResult {
    /** Emails removed (zero in attachments-only mode). */
    emails: number;
    /** Attachment rows and R2 objects removed. */
    attachments: number;
    /** Rows still inside the range, so a large backlog needs repeated runs. */
    remaining: number;
}

async function deleteR2Objects(bucket: R2Bucket | undefined, keys: string[]): Promise<void> {
    if (!bucket || keys.length === 0) {
        return;
    }
    for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
        try {
            await bucket.delete(keys.slice(i, i + R2_DELETE_BATCH));
        } catch (e) {
            console.error('[cleanup] r2.delete.failed', (e as Error).message);
        }
    }
}

function collectStoredKeys(targets: { raw_key: string | null; body_html: string | null; body_text: string | null }[]): string[] {
    const keys: string[] = [];
    for (const target of targets) {
        if (target.raw_key) {
            keys.push(target.raw_key);
        }
        for (const body of [target.body_html, target.body_text]) {
            // Inline bodies are plain text in D1; only offloaded ones have keys.
            if (isR2Pointer(body)) {
                keys.push(body as string);
            }
        }
    }
    return keys;
}

/** Remove specific emails together with their attachments and stored bodies. */
export async function purgeEmailsByIds(dao: Dao, bucket: R2Bucket | undefined, targets: EmailCleanupTarget[]): Promise<CleanupResult> {
    if (targets.length === 0) {
        return { emails: 0, attachments: 0, remaining: 0 };
    }
    const ids = targets.map(target => target.id);
    const attachments = await dao.findAttachmentKeys(ids);
    await deleteR2Objects(bucket, [...collectStoredKeys(targets), ...attachments.map(att => att.r2_key)]);
    if (attachments.length > 0) {
        await dao.deleteAttachmentsByIds(attachments.map(att => att.id));
    }
    await dao.deleteEmailsByIds(ids);
    return { emails: targets.length, attachments: attachments.length, remaining: 0 };
}

/** Permanently remove every email received before the cutoff (null removes all). */
export async function purgeEmails(dao: Dao, bucket: R2Bucket | undefined, before: string | null): Promise<CleanupResult> {
    let emails = 0;
    let attachments = 0;
    for (let pass = 0; pass < MAX_SCANS; pass++) {
        const targets = await dao.findCleanupTargets(before, SCAN_BATCH);
        if (targets.length === 0) {
            break;
        }
        const result = await purgeEmailsByIds(dao, bucket, targets);
        emails += result.emails;
        attachments += result.attachments;
        if (targets.length < SCAN_BATCH) {
            break;
        }
    }
    return { emails, attachments, remaining: await dao.countCleanupTargets(before) };
}

/** Remove stored attachments of emails in the range, keeping the messages. */
export async function purgeAttachments(dao: Dao, bucket: R2Bucket | undefined, before: string | null): Promise<CleanupResult> {
    let attachments = 0;
    for (let pass = 0; pass < MAX_SCANS; pass++) {
        const rows = await dao.findAttachmentsBefore(before, SCAN_BATCH);
        if (rows.length === 0) {
            break;
        }
        await deleteR2Objects(bucket, rows.map(row => row.r2_key));
        await dao.deleteAttachmentsByIds(rows.map(row => row.id));
        attachments += rows.length;
        if (rows.length < SCAN_BATCH) {
            break;
        }
    }
    await dao.clearAttachmentFlags(before);
    return { emails: 0, attachments, remaining: await dao.countAttachmentsBefore(before) };
}
