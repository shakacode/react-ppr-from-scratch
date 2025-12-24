/**
 * =============================================================================
 * ASYNC STORAGE - The "Context" for Tracking Render Mode
 * =============================================================================
 *
 * This is a simplified version of Next.js's workUnitAsyncStorage.
 *
 * WHY DO WE NEED THIS?
 * --------------------
 * When React renders a component tree, we need to know:
 * 1. Are we prerendering (build time) or handling a request (runtime)?
 * 2. If prerendering, did any component try to access dynamic data?
 *
 * Node.js's AsyncLocalStorage lets us pass this context through the entire
 * render without explicitly threading it through every component.
 *
 * Think of it like React Context, but for the server-side Node.js runtime.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// Create a single storage instance that will hold our render context
export const renderStorage = new AsyncLocalStorage();

/**
 * Store Types - What mode are we rendering in?
 *
 * In Next.js, there are many store types (prerender-ppr, prerender-legacy,
 * request, cache, etc.). We simplify to just two:
 */

/**
 * Create a PRERENDER store (used at build time)
 *
 * During prerender, we track any dynamic API accesses. If a component
 * calls cookies() or headers(), we record it here.
 */
export function createPrerenderStore() {
  return {
    type: 'prerender',

    // Track which dynamic APIs were accessed
    // In Next.js, this is called DynamicTrackingState
    dynamicAccesses: [],

    // Has any component accessed dynamic data?
    accessedDynamicData: false,
  };
}

/**
 * Create a REQUEST store (used at request time)
 *
 * At request time, dynamic APIs actually return real data
 * (the actual cookies from the request, etc.)
 */
export function createRequestStore(req) {
  return {
    type: 'request',

    // The actual HTTP request - dynamic APIs will read from this
    request: req,
  };
}

/**
 * Get the current store (must be called within a render context)
 */
export function getStore() {
  const store = renderStorage.getStore();
  if (!store) {
    throw new Error(
      'getStore() was called outside of a render context. ' +
      'Make sure you\'re inside renderStorage.run()'
    );
  }
  return store;
}

/**
 * Check if we're currently prerendering
 */
export function isPrerendering() {
  const store = renderStorage.getStore();
  return store?.type === 'prerender';
}

/**
 * Record that a dynamic API was accessed during prerender
 *
 * In Next.js, this is part of the postponeWithTracking function.
 * When you call cookies() during prerender, this gets called.
 */
export function trackDynamicAccess(expression) {
  const store = renderStorage.getStore();

  if (store?.type === 'prerender') {
    store.dynamicAccesses.push({
      expression,
      stack: new Error().stack, // Capture stack for debugging
    });
    store.accessedDynamicData = true;

    console.log(`[PPR] Dynamic access detected: ${expression}`);
  }
}

/**
 * Check if any dynamic data was accessed during the current prerender
 */
export function hasAccessedDynamicData() {
  const store = renderStorage.getStore();
  return store?.type === 'prerender' && store.accessedDynamicData;
}

/**
 * Get all dynamic accesses (for debugging/error messages)
 */
export function getDynamicAccesses() {
  const store = renderStorage.getStore();
  return store?.type === 'prerender' ? store.dynamicAccesses : [];
}
