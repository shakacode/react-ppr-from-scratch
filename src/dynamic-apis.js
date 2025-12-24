/**
 * =============================================================================
 * DYNAMIC APIs - The Functions That Make a Component "Dynamic"
 * =============================================================================
 *
 * This demo shows how PPR works by using Suspense + suspension.
 *
 * IMPORTANT DISCOVERY:
 * --------------------
 * We investigated React's postpone mechanism thoroughly:
 *
 * 1. React HAS a postpone mechanism internally:
 *    - Symbol: Symbol.for('react.postpone')
 *    - File: packages/react/src/ReactPostpone.js
 *    - Gated by: enablePostpone feature flag
 *
 * 2. BUT it's DISABLED in all npm builds (including experimental):
 *    - enablePostpone = __EXPERIMENTAL__ in source
 *    - Compiled to FALSE in npm builds
 *    - Only enabled in Next.js's custom React builds
 *
 * 3. Our approach: Use Suspense + never-resolving Promise
 *    - Achieves the same visual result
 *    - Works with standard React 19 or experimental builds
 *    - At request time, we do a full re-render (not resume)
 *
 * HOW NEXT.JS DOES IT (for reference):
 * ------------------------------------
 * Next.js uses a custom React build where enablePostpone = true.
 * Their React.unstable_postpone() throws:
 *   const postponeInstance = new Error(reason);
 *   postponeInstance.$$typeof = Symbol.for('react.postpone');
 *   throw postponeInstance;
 *
 * React's Fizz server catches this and saves the position for resume().
 */

import {
  renderStorage,
  trackDynamicAccess,
} from './async-storage.js';

// ============================================================================
// POSTPONE IMPLEMENTATION
// ============================================================================
//
// We use a never-resolving Promise to suspend the component permanently.
// This causes React to:
// 1. Stop rendering this subtree
// 2. Render the Suspense fallback instead
// 3. At request time, we do a fresh render with real data
//
// This is less efficient than React's true postpone (which can resume),
// but achieves the same user-facing result.
// ============================================================================

/**
 * Postpone rendering - marks this component as dynamic
 *
 * @param {string} route - The route being rendered
 * @param {string} expression - The dynamic API that triggered postpone
 */
function postpone(route, expression) {
  console.log(`[PPR] Suspending render for: ${expression}`);

  // Throw a Promise that never resolves
  // This causes permanent suspension -> Suspense fallback is rendered
  throw new Promise(() => {});
}

console.log('[PPR] Using Suspense-based postpone (works with all React 19 builds)');

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

