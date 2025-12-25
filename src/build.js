/**
 * =============================================================================
 * BUILD SCRIPT - Next.js-Style Two-Phase Prerendering
 * =============================================================================
 *
 * This demonstrates how Next.js prerenders pages with 'use cache' components.
 *
 * NEXT.JS'S APPROACH (and ours):
 * ------------------------------
 *
 * RENDER 1: "Prospective Render" (Cache Filling)
 *   - Start React prerender
 *   - Components with cached() functions execute their async work
 *   - Results are stored in the cache
 *   - cacheSignal tracks pending cache reads
 *   - Wait for cacheReady() before proceeding
 *
 * RENDER 2: "Final Render" (Cache Reading)
 *   - Start React prerender again
 *   - Cached functions return INSTANTLY from cache
 *   - Components complete within React's timing window
 *   - Static shell is captured with all cached content
 *
 * KEY INSIGHT:
 * ------------
 * Next.js doesn't "wait longer" for async operations. Instead, it:
 * 1. Uses a first render to discover and fill caches
 * 2. Uses a second render where cached data is instantly available
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import React from 'react';

// Import the static prerender API
import { prerenderToNodeStream } from 'react-dom/static';

import { App } from './components/App.js';
import { renderStorage, createPrerenderStore } from './async-storage.js';

// Import the cache module
import {
  setRenderPhase,
  cacheReady,
  saveCache,
  clearCache,
  getCacheStats,
  resetCacheSignal,
} from './cache.js';

/**
 * Perform a React prerender and return the result
 */
async function performPrerender(prerenderStore, options = {}) {
  const { abortAfterMs = 100, phase = 'unknown' } = options;

  const controller = new AbortController();
  const chunks = [];

  const resultPromise = renderStorage.run(prerenderStore, async () => {
    const pendingResult = prerenderToNodeStream(
      React.createElement(App),
      {
        signal: controller.signal,
        onError(error) {
          if (!error.message?.includes('abort')) {
            console.error(`   ❌ [${phase}] Render error:`, error.message);
          }
        }
      }
    );

    // Give components time to start, then abort
    await new Promise(resolve => setTimeout(resolve, abortAfterMs));

    console.log(`   ⏱️  [${phase}] Aborting prerender...`);
    controller.abort(`${phase} complete`);

    const result = await pendingResult;

    // Read the prelude stream
    for await (const chunk of result.prelude) {
      chunks.push(chunk);
    }

    return {
      html: Buffer.concat(chunks).toString('utf-8'),
      postponed: result.postponed
    };
  });

  return resultPromise;
}

/**
 * Main build function
 */
async function build() {
  console.log('');
  console.log('='.repeat(70));
  console.log(' PPR BUILD - Next.js-Style Two-Phase Prerendering');
  console.log('='.repeat(70));
  console.log('');

  // Clear any stale cache
  mkdirSync('./dist', { recursive: true });
  clearCache();

  // =========================================================================
  // PHASE 1: PROSPECTIVE RENDER (Cache Filling)
  // =========================================================================
  //
  // This is like Next.js's "prospective render". We render the app to
  // discover and fill all caches. The result of this render is discarded.
  //
  // =========================================================================

  console.log('');
  console.log('🔄 PHASE 1: Prospective Render (Cache Filling)');
  console.log('='.repeat(50));
  console.log('');

  setRenderPhase('prospective');
  const prospectiveStore = createPrerenderStore();

  console.log('   Starting React prerender...');
  console.log('   (Cached functions will execute during this render)');
  console.log('');

  // Start the prospective render - don't abort too quickly!
  // We need to let cached functions complete.
  const prospectiveController = new AbortController();

  const prospectivePromise = renderStorage.run(prospectiveStore, async () => {
    return prerenderToNodeStream(
      React.createElement(App),
      {
        signal: prospectiveController.signal,
        onError(error) {
          if (!error.message?.includes('abort')) {
            console.error('   ❌ [Prospective] Error:', error.message);
          }
        }
      }
    );
  });

  // Wait for all caches to be filled (like cacheSignal.cacheReady())
  console.log('   ⏳ Waiting for all caches to fill...');
  await cacheReady();
  console.log('   ✅ All caches filled!');
  console.log('');

  // Now abort the prospective render - we don't need its output
  prospectiveController.abort('Prospective render complete - caches filled');

  // Consume the prospective result (we discard it)
  try {
    const prospectiveResult = await prospectivePromise;
    for await (const _ of prospectiveResult.prelude) {
      // Discard chunks
    }
  } catch (e) {
    // Expected - we aborted
  }

  // Save the cache
  saveCache();

  const cacheStats = getCacheStats();
  console.log(`   📊 Cache Statistics:`);
  console.log(`      Entries: ${cacheStats.size}`);
  cacheStats.entries.forEach(key => console.log(`      - ${key}`));
  console.log('');

  // =========================================================================
  // PHASE 2: FINAL RENDER (Cache Reading)
  // =========================================================================
  //
  // This is like Next.js's "final render". The cache is warm, so cached
  // functions return instantly. This allows async components to complete
  // within React's timing window.
  //
  // =========================================================================

  console.log('');
  console.log('🎯 PHASE 2: Final Render (Cache Reading)');
  console.log('='.repeat(50));
  console.log('');

  // Reset the cache signal for the new render
  resetCacheSignal();
  setRenderPhase('final');
  const finalStore = createPrerenderStore();

  console.log('   Starting React prerender with warm cache...');
  console.log('   (Cached functions will return instantly)');
  console.log('');

  let result;
  try {
    result = await performPrerender(finalStore, {
      abortAfterMs: 100,
      phase: 'Final'
    });
  } catch (error) {
    console.error('❌ Final render failed:', error);
    process.exit(1);
  }

  const { html: htmlContent, postponed: postponedState } = result;

  // =========================================================================
  // STEP 3: Analyze and save results
  // =========================================================================

  console.log('');
  console.log('📊 Analyzing results...');
  console.log('');

  const dynamicAccesses = finalStore.dynamicAccesses;
  const hasDynamicContent = dynamicAccesses.length > 0;
  const hasPostponedState = postponedState !== null;

  if (dynamicAccesses.length > 0) {
    console.log('   ⚡ Dynamic APIs detected (will stream at request time):');
    dynamicAccesses.forEach((access, i) => {
      console.log(`      ${i + 1}. ${access.expression}`);
    });
  } else {
    console.log('   ✅ No dynamic APIs - page is fully static!');
  }

  if (hasPostponedState) {
    console.log('');
    console.log('   🎯 Postponed state captured for resume()');
  }

  // Save artifacts
  console.log('');
  console.log('💾 Saving build artifacts...');

  writeFileSync('./dist/shell.html', htmlContent, 'utf-8');
  console.log('   ✅ dist/shell.html');

  const metadata = {
    hasDynamicContent,
    hasPostponedState,
    dynamicAccesses: dynamicAccesses.map(a => a.expression),
    buildTime: new Date().toISOString(),
  };
  writeFileSync('./dist/metadata.json', JSON.stringify(metadata, null, 2), 'utf-8');
  console.log('   ✅ dist/metadata.json');

  if (hasPostponedState) {
    writeFileSync('./dist/postponed.json', JSON.stringify(postponedState), 'utf-8');
    console.log('   ✅ dist/postponed.json');
  }

  // =========================================================================
  // Summary
  // =========================================================================

  console.log('');
  console.log('='.repeat(70));
  console.log(' BUILD COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  console.log('The build used Next.js-style two-phase prerendering:');
  console.log('');
  console.log('  PHASE 1 (Prospective): Rendered to fill caches');
  console.log('  PHASE 2 (Final):       Rendered with warm caches');
  console.log('');
  console.log(`Page type: ${hasDynamicContent ? 'PARTIAL (has dynamic holes)' : 'FULLY STATIC'}`);
  console.log('');
  console.log('Run: npm start');
  console.log('Visit: http://localhost:3000');
  console.log('');

  // Show preview
  console.log('='.repeat(70));
  console.log(' STATIC SHELL PREVIEW');
  console.log('='.repeat(70));
  console.log('');
  console.log(htmlContent.slice(0, 2500));
  if (htmlContent.length > 2500) {
    console.log('... (truncated)');
  }
  console.log('');
}

build().catch(console.error);
