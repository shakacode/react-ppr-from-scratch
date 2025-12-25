/**
 * =============================================================================
 * CACHE MODULE - Next.js-Style Two-Phase Caching
 * =============================================================================
 *
 * This module implements caching similar to Next.js's 'use cache' directive.
 *
 * NEXT.JS'S APPROACH:
 * -------------------
 * 1. RENDER 1 ("Prospective Render"):
 *    - React renders the component tree
 *    - 'use cache' functions execute and store results in prerenderResumeDataCache
 *    - cacheSignal tracks when all cache reads are complete
 *    - Wait for cacheSignal.cacheReady()
 *
 * 2. RENDER 2 ("Final Render"):
 *    - React renders again
 *    - 'use cache' functions return instantly from renderResumeDataCache
 *    - Components complete and are included in static shell
 *
 * OUR IMPLEMENTATION:
 * -------------------
 * We simulate this with:
 * - Phase 1: "Prospective render" with cache filling enabled
 * - Phase 2: "Final render" with cache reading only
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';

// The in-memory cache store (like Next.js's prerenderResumeDataCache)
const cacheStore = new Map();

// Cache file path
const CACHE_FILE = './dist/cache.json';

// Track the current phase
let currentPhase = 'none'; // 'prospective' | 'final' | 'none'

/**
 * Set the current render phase
 * - 'prospective': Cache filling phase (execute and store)
 * - 'final': Cache reading phase (read only, must hit)
 */
export function setRenderPhase(phase) {
  currentPhase = phase;
  console.log(`   📍 Render phase: ${phase}`);
}

export function getRenderPhase() {
  return currentPhase;
}

/**
 * Check if we're in the prospective (cache-filling) phase
 */
export function isProspectiveRender() {
  return currentPhase === 'prospective';
}

/**
 * Check if we're in the final (cache-reading) phase
 */
export function isFinalRender() {
  return currentPhase === 'final';
}

/**
 * Load cache from disk
 */
export function loadCache() {
  if (existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      for (const [key, value] of Object.entries(data)) {
        cacheStore.set(key, value);
      }
      console.log(`   📦 Loaded ${cacheStore.size} cached entries from disk`);
    } catch (e) {
      console.log('   ⚠️  Could not load cache:', e.message);
    }
  }
}

/**
 * Save cache to disk
 */
export function saveCache() {
  const data = Object.fromEntries(cacheStore.entries());
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`   💾 Saved ${cacheStore.size} cached entries to disk`);
}

/**
 * Clear the cache
 */
export function clearCache() {
  cacheStore.clear();
  console.log('   🗑️  Cache cleared');
}

/**
 * Generate a cache key from function name and arguments
 */
function generateCacheKey(name, args) {
  const argsKey = JSON.stringify(args);
  return `${name}:${argsKey}`;
}

/**
 * Signal for tracking pending cache reads (like Next.js's CacheSignal)
 *
 * Next.js's CacheSignal works by:
 * 1. Starting a render
 * 2. As 'use cache' functions are called, beginRead() is called
 * 3. When they complete, endRead() is called
 * 4. cacheReady() waits until all reads that STARTED have completed
 *
 * The tricky part: we need to wait for the render to START encountering
 * cached functions before we can know if there are any to wait for.
 */
let pendingCacheReads = 0;
let cacheReadyResolvers = [];
let hasStartedReading = false;
let startReadingResolver = null;

export function beginCacheRead() {
  pendingCacheReads++;
  hasStartedReading = true;
  // If someone was waiting to know if any reads started, notify them
  if (startReadingResolver) {
    startReadingResolver();
    startReadingResolver = null;
  }
}

export function endCacheRead() {
  pendingCacheReads--;
  if (pendingCacheReads === 0 && hasStartedReading) {
    // Count reached 0 - but wait one event loop cycle before resolving
    // (React might schedule more work that triggers more cache reads)
    noMorePendingCaches();
  }
}

/**
 * Schedule a callback after "one trip around the event loop"
 * This matches Next.js's approach: setImmediate → setTimeout(0)
 */
function scheduleAfterEventLoop(cb) {
  setImmediate(() => {
    setTimeout(cb, 0);
  });
}

/**
 * Wait for all cache reads to complete (like cacheSignal.cacheReady())
 *
 * Next.js's approach:
 * - If there are pending reads, wait for them to complete
 * - If count is 0, wait "one task" to allow initial cache reads to start
 * - Uses event loop scheduling, NOT fixed timeouts
 */
export function cacheReady() {
  return new Promise(resolve => {
    cacheReadyResolvers.push(resolve);

    if (pendingCacheReads === 0) {
      // No pending reads yet - wait one trip around the event loop
      // to give React a chance to start rendering and hit cached functions
      noMorePendingCaches();
    }
  });
}

/**
 * Called when count reaches 0 - schedule check after event loop
 * This mirrors Next.js's noMorePendingCaches()
 */
function noMorePendingCaches() {
  scheduleAfterEventLoop(() => {
    if (pendingCacheReads === 0) {
      // Still 0 after event loop - all caches are ready
      cacheReadyResolvers.forEach(resolve => resolve());
      cacheReadyResolvers = [];
    }
    // If count > 0, a new read started - wait for it
  });
}

/**
 * Reset the cache signal state (call between renders)
 */
export function resetCacheSignal() {
  pendingCacheReads = 0;
  cacheReadyResolvers = [];
  hasStartedReading = false;
  startReadingResolver = null;
}

/**
 * Check if there are pending cache reads
 */
export function hasPendingCacheReads() {
  return pendingCacheReads > 0;
}

/**
 * The cached() wrapper - Next.js style
 *
 * Behavior depends on render phase:
 * - Prospective: Execute function, store result, track with cacheSignal
 * - Final: Return from cache (must hit)
 * - None/Server: Execute and cache (for request-time)
 *
 * @param {string} name - Unique name for this cached function
 * @param {Function} fn - The async function to cache
 * @returns {Function} - A wrapped function that uses the cache
 */
export function cached(name, fn) {
  return async function cachedFunction(...args) {
    const cacheKey = generateCacheKey(name, args);

    // Check if we have a cached result
    if (cacheStore.has(cacheKey)) {
      console.log(`   ⚡ Cache HIT: ${name}`);
      return cacheStore.get(cacheKey);
    }

    // Cache miss
    if (isFinalRender()) {
      // In final render, cache should have been filled during prospective render
      // This shouldn't happen if prospective render worked correctly
      console.log(`   ⚠️  Cache MISS in final render: ${name} - this is unexpected!`);
    }

    // Execute the function (prospective render or first access)
    console.log(`   🔄 Cache MISS: ${name} - executing...`);

    // Track this as a pending cache read (like cacheSignal.beginRead())
    beginCacheRead();

    try {
      const result = await fn(...args);

      // Store in cache
      cacheStore.set(cacheKey, result);
      console.log(`   ✅ Cached: ${name}`);

      return result;
    } finally {
      // Mark cache read as complete (like cacheSignal.endRead())
      endCacheRead();
    }
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: cacheStore.size,
    entries: Array.from(cacheStore.keys()),
    phase: currentPhase,
    pendingReads: pendingCacheReads,
  };
}

// =============================================================================
// COMPONENT-LEVEL CACHING
// =============================================================================
//
// Next.js can cache entire components using RSC serialization (Flight protocol).
// For our demo, we'll use a simpler approach: cache the React element directly.
//
// NOTE: This works because React elements are plain JavaScript objects:
//   { type: 'div', props: { children: 'Hello' }, ... }
//
// In production, Next.js uses renderToReadableStream() to properly serialize
// React elements, handle client components, promises, etc.
// =============================================================================

/**
 * Wrap a component to cache its entire output (React elements)
 *
 * Usage:
 *   const CachedComponent = cachedComponent('my-component', MyComponent);
 *
 * This is similar to:
 *   async function MyComponent() {
 *     'use cache'
 *     ...
 *   }
 *
 * @param {string} name - Unique name for this cached component
 * @param {Function} Component - The async component function
 * @returns {Function} - A wrapped component that caches its output
 */
export function cachedComponent(name, Component) {
  return async function CachedComponentWrapper(props) {
    // Generate cache key from component name + props
    const cacheKey = `component:${name}:${JSON.stringify(props)}`;

    // Check cache
    if (cacheStore.has(cacheKey)) {
      console.log(`   ⚡ Component Cache HIT: ${name}`);
      return cacheStore.get(cacheKey);  // Return cached React elements!
    }

    console.log(`   🔄 Component Cache MISS: ${name} - rendering...`);

    // Track as pending cache read
    beginCacheRead();

    try {
      // Render the component (this is where async work happens)
      const result = await Component(props);

      // Cache the React element tree
      // (In Next.js, this would be serialized with Flight protocol)
      cacheStore.set(cacheKey, result);
      console.log(`   ✅ Component Cached: ${name}`);

      return result;
    } finally {
      endCacheRead();
    }
  };
}
