import { isTMA } from '@tma.js/sdk-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initApp } from './init';
import { setupMockEnv } from './mockEnv';
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
