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

    useEffect(() => {
        const canGoBack = location.pathname !== '/inbox' && location.pathname !== '/';
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
    }, [location.pathname, navigate]);

    return null;
}
