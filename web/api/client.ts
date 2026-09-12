import type {
    Address,
    AddressTestResponse,
    AddressType,
    Email,
    EmailDetailResponse,
    EmailListResponse,
    Folder,
    MeResponse,
    RuntimeSettings,
} from '../types';
import { retrieveRawInitData } from '@tma.js/sdk-react';

export class ApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

function authHeader(): string {
    const raw = retrieveRawInitData() || '';
    return `tma ${raw}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', authHeader());
    if (init.body) {
        headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(path, { ...init, headers });
    if (!response.ok) {
        let message = response.statusText;
        try {
            const body = await response.json() as { error?: string };
            message = body.error || message;
        } catch {
            // ignore non-json error bodies
        }
        throw new ApiError(response.status, message);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return await response.json() as T;
}

export interface EmailQuery {
    folder?: Folder | 'all';
    q?: string;
    starred?: boolean;
    unread?: boolean;
    limit?: number;
    offset?: number;
}

export const api = {
    me(): Promise<MeResponse> {
        return request<MeResponse>('/api/me');
    },

    listEmails(query: EmailQuery = {}): Promise<EmailListResponse> {
        const params = new URLSearchParams();
        if (query.folder)
            params.set('folder', query.folder);
        if (query.q)
            params.set('q', query.q);
        if (query.starred !== undefined)
            params.set('starred', `${query.starred}`);
        if (query.unread !== undefined)
            params.set('unread', `${query.unread}`);
        if (query.limit !== undefined)
            params.set('limit', `${query.limit}`);
        if (query.offset !== undefined)
            params.set('offset', `${query.offset}`);
        const suffix = params.toString();
        return request<EmailListResponse>(`/api/emails${suffix ? `?${suffix}` : ''}`);
    },

    getEmail(id: string): Promise<EmailDetailResponse> {
        return request<EmailDetailResponse>(`/api/emails/${id}`);
    },

    updateEmail(id: string, patch: { isRead?: boolean; isStarred?: boolean; folder?: Folder }): Promise<{ email: Email }> {
        return request<{ email: Email }>(`/api/emails/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
        });
    },

    deleteEmail(id: string): Promise<{ success: boolean }> {
        return request<{ success: boolean }>(`/api/emails/${id}`, { method: 'DELETE' });
    },

    summarize(id: string): Promise<{ summary: string }> {
        return request<{ summary: string }>(`/api/emails/${id}/summary`, { method: 'POST' });
    },

    reply(id: string, text: string): Promise<{ success: boolean }> {
        return request<{ success: boolean }>(`/api/emails/${id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ text }),
        });
    },

    listAddresses(type?: AddressType): Promise<{ addresses: Address[] }> {
        const suffix = type ? `?type=${type}` : '';
        return request<{ addresses: Address[] }>(`/api/addresses${suffix}`);
    },

    addAddress(address: string, type: AddressType, note?: string): Promise<{ address: Address }> {
        return request<{ address: Address }>('/api/addresses', {
            method: 'POST',
            body: JSON.stringify({ address, type, note }),
        });
    },

    removeAddress(id: string): Promise<{ success: boolean }> {
        return request<{ success: boolean }>(`/api/addresses/${id}`, { method: 'DELETE' });
    },

    testAddress(address: string): Promise<AddressTestResponse> {
        return request<AddressTestResponse>('/api/addresses/test', {
            method: 'POST',
            body: JSON.stringify({ address }),
        });
    },

    getSettings(): Promise<{ settings: RuntimeSettings }> {
        return request<{ settings: RuntimeSettings }>('/api/settings');
    },

    updateSettings(patch: Partial<RuntimeSettings>): Promise<{ settings: RuntimeSettings }> {
        return request<{ settings: RuntimeSettings }>('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(patch),
        });
    },

    attachmentUrl(emailId: string, attachmentId: string): string {
        return `/api/emails/${emailId}/attachments/${attachmentId}`;
    },
};

export async function fetchAttachmentBlob(emailId: string, attachmentId: string): Promise<Blob> {
    const response = await fetch(api.attachmentUrl(emailId, attachmentId), {
        headers: { Authorization: authHeader() },
    });
    if (!response.ok) {
        throw new ApiError(response.status, response.statusText);
    }
    return await response.blob();
}
