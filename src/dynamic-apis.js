/**
 * =============================================================================
 * DYNAMIC APIs - The Functions That Make a Component "Dynamic"
 * =============================================================================
 *
 * This demo shows how PPR works using React's real prerender/resume mechanism.
 *
 * HOW IT WORKS:
 * -------------
 * 1. During prerender, dynamic APIs call React.unstable_postpone()
 * 2. This throws a special Postpone error that React captures
 * 3. React renders the Suspense fallback and records the "postponed" state
 * 4. At request time, resumeToPipeableStream() continues from that state
 * 5. Dynamic APIs now return real data, and React renders only those parts
 *
 * WHY React.unstable_postpone?
 * ----------------------------
 * React.unstable_postpone(reason) is React's official API for signaling that
 * a component should be postponed during prerendering. It throws a special
 * error with $$typeof = Symbol.for('react.postpone') that React's Fizz server
 * recognizes and handles specially.
 *
 * This is the same API that Next.js uses for Partial Prerendering (PPR).
 */

import React from 'react';
import {
  renderStorage,
  trackDynamicAccess,
} from './async-storage.js';

/**
 * Postpone rendering - marks this component as dynamic
 *
 * Uses React.unstable_postpone() which throws a special Postpone error.
 * During prerender, this causes React to:
 * 1. Stop rendering this subtree
 * 2. Render the Suspense fallback instead
 * 3. Capture this location in the "postponed" state
 *
 * At request time, this function is not called because the store type
 * is 'request', so the component renders with real data.
 *
 * @param {string} route - The route being rendered
 * @param {string} expression - The dynamic API that triggered postpone
 */
function postpone(route, expression) {
  const reason = `Route ${route} needs to bail out of prerendering at this point because it used ${expression}.`;
  console.log(`[PPR] Postponing render: ${expression}`);

  // Use React's official postpone API
  React.unstable_postpone(reason);
}

console.log('[PPR] Using React.unstable_postpone (React 19.2.3 experimental)');

/**
 * cookies() - Access request cookies
 *
 * NEXT.JS IMPLEMENTATION:
 * packages/next/src/server/request/cookies.ts
 *
 * The actual Next.js code calls postponeWithTracking() when:
 * - Store type is 'prerender-ppr' and cookies are accessed
 */
export async function cookies() {
  const store = renderStorage.getStore();

  if (!store) {
    throw new Error('cookies() must be called within a render context');
  }

  if (store.type === 'prerender') {
    // During prerender, we can't access cookies - they don't exist yet!
    trackDynamicAccess('cookies()');
    postpone('/demo', 'cookies()');
    // Never reached - postpone throws
  }

  if (store.type === 'request') {
    // At request time, we have real cookies
    const req = store.request;
    const cookieHeader = req.headers.cookie || '';

    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      if (name) {
        cookies[name] = rest.join('=');
      }
    });

    return {
      get(name) {
        return cookies[name] ? { name, value: cookies[name] } : undefined;
      },
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
    };
  }
}

/**
 * headers() - Access request headers
 */
export async function headers() {
  const store = renderStorage.getStore();

  if (!store) {
    throw new Error('headers() must be called within a render context');
  }

  if (store.type === 'prerender') {
    trackDynamicAccess('headers()');
    postpone('/demo', 'headers()');
  }

  if (store.type === 'request') {
    const req = store.request;

    return {
      get(name) {
        return req.headers[name.toLowerCase()];
      },
      entries() {
        return Object.entries(req.headers);
      },
    };
  }
}

/**
 * getCurrentTime() - Get the current server time
 */
export async function getCurrentTime() {
  const store = renderStorage.getStore();

  if (!store) {
    throw new Error('getCurrentTime() must be called within a render context');
  }

  if (store.type === 'prerender') {
    trackDynamicAccess('getCurrentTime()');
    postpone('/demo', 'getCurrentTime()');
  }

  if (store.type === 'request') {
    return new Date().toLocaleTimeString();
  }
}

/**
 * connection() - Signal that this component needs a live connection
 */
export async function connection() {
  const store = renderStorage.getStore();

  if (!store) {
    throw new Error('connection() must be called within a render context');
  }

  if (store.type === 'prerender') {
    trackDynamicAccess('connection()');
    postpone('/demo', 'connection()');
  }

  return undefined;
}

