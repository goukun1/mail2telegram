import type { Address, AddressTestResponse, AddressType } from '../types';
import { List, ListInput, ListItem } from 'konsta/react';
import { useState } from 'react';
import { api } from '../api/client';
import { CheckIcon, PlusIcon } from '../components/ios/Icons';
import { useAsync } from '../hooks/useAsync';
import { haptic } from '../lib/haptics';

export interface AddressListSectionProps {
    type: AddressType;
    title: string;
    hint: string;
    autoTest?: boolean;
    defaultExpanded?: boolean;
}

/** iOS grouped list of address rules with inline add and test. */
export function AddressListSection({ type, title, hint, autoTest, defaultExpanded }: AddressListSectionProps) {
    const [expanded, setExpanded] = useState(defaultExpanded ?? false);
    const [value, setValue] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<AddressTestResponse | null>(null);

    const { data, loading, reload } = useAsync<{ addresses: Address[] }>(
        () => api.listAddresses(type),
        [type],
    );
    const addresses = data?.addresses ?? [];

    const add = async () => {
        if (!value.trim()) {
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await api.addAddress(value.trim(), type, note.trim() || undefined);
            setValue('');
            setNote('');
            setTestResult(null);
            haptic.notification('success');
            reload();
        } catch (e) {
            haptic.notification('error');
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (address: Address) => {
        setBusy(true);
        try {
            await api.removeAddress(address.id);
            haptic.impact();
            reload();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const test = async () => {
        if (!value.trim()) {
            return;
        }
        setBusy(true);
        setError(null);
        setTestResult(null);
        try {
            setTestResult(await api.testAddress(value.trim()));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <List strongIos outlineIos className="!mt-0">
                <ListItem
                    link
                    title={(
                        <span className="flex items-center justify-between">
                            <span>{title}</span>
                            <span className="text-[15px] text-[var(--ios-gray)]">{addresses.length}</span>
                        </span>
                    )}
                    onClick={() => setExpanded(current => !current)}
                />
            </List>

            {expanded ? (
                <>
                    <List strongIos outlineIos className="!mt-0">
                        <ListInput
                            label="Address or Regex"
                            placeholder="someone@example.com"
                            value={value}
                            onChange={(e: any) => setValue(e.target.value)}
                            clearButton
                        />
                        <ListInput
                            label="Note"
                            placeholder="Optional"
                            value={note}
                            onChange={(e: any) => setNote(e.target.value)}
                            clearButton
                        />
                        <ListItem
                            link
                            title={busy ? 'Adding…' : 'Add to List'}
                            media={<PlusIcon size={20} />}
                            onClick={add}
                            className={busy || !value.trim() ? 'opacity-40' : ''}
                        />
                        {autoTest ? (
                            <ListItem
                                link
                                title="Test Address"
                                media={<CheckIcon size={20} />}
                                onClick={test}
                                className={busy || !value.trim() ? 'opacity-40' : ''}
                            />
                        ) : null}
                    </List>

                    {testResult ? (
                        <div className="settings-note">
                            {`Result: ${testResult.status === 'no_match' ? 'no match' : testResult.status}`}
                            {testResult.matchedWhite.length > 0 ? ` · white: ${testResult.matchedWhite.join(', ')}` : ''}
                            {testResult.matchedBlock.length > 0 ? ` · block: ${testResult.matchedBlock.join(', ')}` : ''}
                        </div>
                    ) : null}
                    {error ? <div className="settings-note" style={{ color: '#ff3b30' }}>{error}</div> : null}

                    <List strongIos outlineIos className="!mt-0">
                        {addresses.length === 0 && !loading ? (
                            <ListItem title={<span className="text-[var(--ios-gray)]">No Entries</span>} />
                        ) : (
                            addresses.map(address => (
                                <ListItem
                                    key={address.id}
                                    title={address.address}
                                    subtitle={address.note || undefined}
                                    after={(
                                        <button
                                            type="button"
                                            className="settings-remove"
                                            disabled={busy}
                                            onClick={() => remove(address)}
                                        >
                                            Delete
                                        </button>
                                    )}
                                />
                            ))
                        )}
                    </List>
                </>
            ) : null}

            <div className="settings-note">{hint}</div>
        </div>
    );
}
