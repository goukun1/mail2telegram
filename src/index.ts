import { emailHandler } from './handler/email';
import { fetchHandler } from './handler/fetch';
import './polyfill';

export default {
    fetch: fetchHandler,
    email: emailHandler,
};
