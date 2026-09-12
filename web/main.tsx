import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTMA } from '@tma.js/sdk-react';
import { initApp } from './init';
import { setupMockEnv } from './mockEnv';
import { App } from './App';
import './styles/index.css';

const debug = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

if (!isTMA() && debug) {
    setupMockEnv();
}

try {
    initApp({ debug });
} catch (e) {
    console.error('[app] init failed', e);
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
