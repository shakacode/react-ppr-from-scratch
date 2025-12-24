/**
 * =============================================================================
 * DYNAMIC APIs - The Functions That Make a Component "Dynamic"
 * =============================================================================
 *
 * This demo shows how PPR works using React's real prerender/resume mechanism.
 *
 * HOW IT WORKS:
 * -------------
 * 1. During prerender, dynamic APIs throw a never-resolving Promise
 * 2. This suspends the component - React renders the Suspense fallback
 * 3. When the prerender is aborted, React captures the "postponed" state
 * 4. At request time, resumeToPipeableStream() continues from that state
 * 5. Dynamic APIs now return real data, and React renders only those parts
 *
 * WHY throw a Promise?
 * --------------------
 * In React's Suspense model, throwing a Promise signals "I'm not ready yet".
 * For server-side prerendering, throwing a never-resolving Promise causes
 * permanent suspension, which React captures as "postponed" state when aborted.
 *
 * This is the same approach used in React's own tests for the prerender API.
 */

import {
  renderStorage,
  trackDynamicAccess,
} from './async-storage.js';

/**
 * Postpone rendering - marks this component as dynamic
 *
 * Throws a never-resolving Promise to suspend the component.
 * During prerender, this causes React to:
 * 1. Stop rendering this subtree
 * 2. Render the Suspense fallback instead
 * 3. Capture this location in the "postponed" state when aborted
 *
 * At request time, this function returns normally (doesn't throw),
 * so the component renders with real data.
 *
 * @param {string} route - The route being rendered
 * @param {string} expression - The dynamic API that triggered postpone
 */
function postpone(route, expression) {
  console.log(`[PPR] Suspending render for: ${expression}`);

  // Throw a Promise that never resolves - this suspends the component
  // React's Fizz server captures this as "postponed" state when aborted
  throw new Promise(() => {});
}

console.log('[PPR] Using Promise suspension (custom React build with enableHalt)');

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

