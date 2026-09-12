import { backButton, initData, init as initSdk, miniApp, retrieveLaunchParams, setDebug, themeParams, viewport } from '@tma.js/sdk-react';

export interface InitOptions {
    debug: boolean;
}

/**
 * Initializes the Mini Apps SDK and mounts the native components used across the
 * app. All mounts are guarded with `ifAvailable` so the app still renders when a
 * Telegram client does not support a component.
 */
export function initApp({ debug }: InitOptions): void {
    if (debug) {
        setDebug(true);
    }
    initSdk();

    miniApp.mount.ifAvailable();
    miniApp.ready.ifAvailable();

    themeParams.mount.ifAvailable();
    themeParams.bindCssVars.ifAvailable();

    viewport.mount.ifAvailable();
    viewport.bindCssVars.ifAvailable();
    viewport.expand.ifAvailable();

    backButton.mount.ifAvailable();

    initData.restore();
}

/** Platform reported by Telegram: `ios`, `android`, `macos`, `tdesktop`, `web`... */
export function getPlatform(): string {
    try {
        return retrieveLaunchParams().tgWebAppPlatform || 'web';
    } catch {
        return 'web';
    }
}

/** True on native desktop clients, where the iPad style split view is used. */
export function isDesktopPlatform(): boolean {
    const platform = getPlatform();
    return platform === 'macos' || platform === 'tdesktop';
}
