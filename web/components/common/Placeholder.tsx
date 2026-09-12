import type { ReactNode } from 'react';
import { Block, Preloader } from 'konsta/react';

export interface StatePlaceholderProps {
    loading?: boolean;
    error?: Error | string | null;
    empty?: boolean;
    emptyText?: string;
    onRetry?: () => void;
    children?: ReactNode;
}

/** Renders loading / error / empty states around page content. */
export function StatePlaceholder({ loading, error, empty, emptyText, onRetry, children }: StatePlaceholderProps) {
    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Preloader />
            </div>
        );
    }
    if (error) {
        const message = typeof error === 'string' ? error : error.message;
        return (
            <Block>
                <div className="rounded-xl bg-red-500/10 p-4 text-center text-[15px] text-red-600">
                    <p className="m-0 mb-2">{message || 'Something went wrong.'}</p>
                    {onRetry && (
                        <button
                            type="button"
                            className="text-[15px] font-medium text-[var(--tg-theme-link-color,#007aff)]"
                            onClick={onRetry}
                        >
                            Try again
                        </button>
                    )}
                </div>
            </Block>
        );
    }
    if (empty) {
        return (
            <Block>
                <div className="py-12 text-center text-[15px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                    {emptyText || 'Nothing here yet.'}
                </div>
            </Block>
        );
    }
    return <>{children}</>;
}
