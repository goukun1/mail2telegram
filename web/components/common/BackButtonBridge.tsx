import { backButton } from '@tma.js/sdk-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Keeps the native Telegram Back Button in sync with the app history:
 * shown whenever there is somewhere to go back to.
 */
export function BackButtonBridge() {
    const navigate = useNavigate();
    const location = useLocation();

    // Settings, or an opened email in compact mode, both need a way back.
    const hasOpenEmail = location.pathname === '/inbox' && new URLSearchParams(location.search).has('id');
    const canGoBack = location.pathname !== '/inbox' || hasOpenEmail;

    useEffect(() => {
        if (canGoBack) {
            backButton.show.ifAvailable();
        } else {
            backButton.hide.ifAvailable();
        }
        const subscription = backButton.onClick.ifAvailable(() => navigate(-1));
        return () => {
            if (subscription.ok) {
                subscription.data();
            }
            backButton.hide.ifAvailable();
        };
    }, [canGoBack, navigate]);

    return null;
}
