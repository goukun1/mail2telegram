import { emitEvent, isTMA, mockTelegramEnv } from '@tma.js/sdk-react';

type MockEnvOptions = NonNullable<Parameters<typeof mockTelegramEnv>[0]>;
type MockEvent = Parameters<NonNullable<MockEnvOptions['onEvent']>>[0];

/**
 * Installs a mock Telegram environment for local development so the Mini App can
 * render outside Telegram. Never runs in production builds.
 */
export function setupMockEnv(): void {
    if (isTMA()) {
        return;
    }
    mockTelegramEnv({
        launchParams: new URLSearchParams([
            ['tgWebAppThemeParams', JSON.stringify({
                bg_color: '#ffffff',
                text_color: '#000000',
                hint_color: '#999999',
                link_color: '#2481cc',
                button_color: '#2481cc',
                button_text_color: '#ffffff',
                secondary_bg_color: '#f1f1f1',
            })],
            ['tgWebAppData', new URLSearchParams([
                ['user', JSON.stringify({ id: 1, first_name: 'Dev', username: 'dev' })],
                ['auth_date', `${Math.floor(Date.now() / 1000)}`],
                ['hash', 'mock'],
            ]).toString()],
            ['tgWebAppVersion', '8.0'],
            ['tgWebAppPlatform', 'web'],
        ]),
        onEvent: (event: MockEvent, next: () => void) => {
            if (event.name === 'web_app_request_theme') {
                emitEvent('theme_changed', {
                    theme_params: {
                        bg_color: '#ffffff',
                        text_color: '#000000',
                        hint_color: '#999999',
                        link_color: '#2481cc',
                        button_color: '#2481cc',
                        button_text_color: '#ffffff',
                        secondary_bg_color: '#f1f1f1',
                    },
                });
            }
            next();
        },
    });
}
