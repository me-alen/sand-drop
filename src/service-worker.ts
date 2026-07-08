/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

// Service worker for offline play. CRA compiles this with workbox's
// InjectManifest because the file is named src/service-worker.ts.

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();

// Precache the compiled app shell (injected at build time).
precacheAndRoute(self.__WB_MANIFEST);

// App-shell routing: serve index.html for all navigation requests.
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(({ request, url }: { request: Request; url: URL }) => {
    if (request.mode !== 'navigate') return false;
    if (url.pathname.startsWith('/_')) return false;
    if (url.pathname.match(fileExtensionRegexp)) return false;
    return true;
}, createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html'));

// Cache same-origin images (icons, logos) that are not part of the precache.
registerRoute(
    ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.png'),
    new StaleWhileRevalidate({
        cacheName: 'images',
        plugins: [new ExpirationPlugin({ maxEntries: 50 })]
    })
);

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
