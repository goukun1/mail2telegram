import type { Address, AddressTestResponse, AddressType } from '../types';
import { Block, Button, Card, List, ListInput, ListItem } from 'konsta/react';
import { useState } from 'react';
import { api } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { haptic } from '../lib/haptics';

export interface AddressListSectionProps {
    type: AddressType;
    title: string;
    hint: string;
    autoTest?: boolean;
    defaultExpanded?: boolean;
}

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
        <Block className="!my-3">
            <Card raised className="!m-0">
                <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setExpanded(current => !current)}
                >
                    <span className="text-[17px] font-semibold">{title}</span>
                    <span className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                        {`${addresses.length} · ${expanded ? 'Hide' : 'Show'}`}
                    </span>
                </button>
                {expanded ? (
                    <div className="mt-3">
                        <p className="settings-hint !px-0 !pt-0">{hint}</p>
                        <List strongIos outlineIos className="!my-0">
                            <ListInput
                                label="Address or regular expression"
                                placeholder="someone@example.com"
                                value={value}
                                onChange={(e: any) => setValue(e.target.value)}
                                clearButton
                            />
                            <ListInput
                                label="Note (optional)"
                                placeholder="Why is this here?"
                                value={note}
                                onChange={(e: any) => setNote(e.target.value)}
                                clearButton
                            />
                        </List>
                        <div className="mt-3 flex gap-2">
                            <Button rounded onClick={add} disabled={busy || !value.trim()}>Add</Button>
                            {autoTest ? (
                                <Button rounded tonal onClick={test} disabled={busy || !value.trim()}>Test</Button>
                            ) : null}
                        </div>
                        {testResult ? (
                            <div className="mt-3 rounded-lg bg-black/5 p-3 text-[13px] dark:bg-white/10">
                                <div className="font-medium">
                                    {`Result: ${testResult.status === 'no_match' ? 'no match' : testResult.status}`}
                                </div>
                                {testResult.matchedWhite.length > 0 ? (
                                    <div className="mt-1 text-[var(--tg-theme-hint-color,#8e8e93)]">
                                        {`White patterns: ${testResult.matchedWhite.join(', ')}`}
                                    </div>
                                ) : null}
                                {testResult.matchedBlock.length > 0 ? (
                                    <div className="mt-1 text-[var(--tg-theme-hint-color,#8e8e93)]">
                                        {`Block patterns: ${testResult.matchedBlock.join(', ')}`}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                        {error ? <div className="mt-2 text-[13px] text-red-600">{error}</div> : null}

                        <List strongIos outlineIos className="!my-3">
                            {addresses.length === 0 && !loading ? (
                                <ListItem title={<span className="text-[var(--tg-theme-hint-color,#8e8e93)]">No entries yet</span>} />
                            ) : (
                                addresses.map(address => (
                                    <ListItem
                                        key={address.id}
                                        title={address.address}
                                        subtitle={address.note || undefined}
                                        after={(
                                            <button
                                                type="button"
                                                className="text-[13px] font-medium text-red-600"
                                                disabled={busy}
                                                onClick={() => remove(address)}
                                            >
                                                Remove
                                            </button>
                                        )}
                                    />
                                ))
                            )}
                        </List>
                    </div>
                ) : null}
            </Card>
        </Block>
    );
}
