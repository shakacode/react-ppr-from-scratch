/**
 * =============================================================================
 * BUILD SCRIPT - Generating the Static Shell with REAL Postpone State
 * =============================================================================
 *
 * This demonstrates how PPR builds a static shell with "holes" for dynamic content
 * using React's REAL prerender/resume mechanism.
 *
 * THE APPROACH:
 * -------------
 * 1. Use prerenderToNodeStream() to start prerendering
 * 2. Dynamic components (those calling cookies(), etc.) suspend via React.use()
 * 3. Abort the prerender - React captures the suspended state as "postponed"
 * 4. Save both the static shell AND the postponed state
 * 5. At request time, use resumeToPipeableStream() to continue from postponed state
 *
 * WHY THIS WORKS:
 * ---------------
 * We're using a custom React build with enableHalt=true (it's enabled by default
 * in React source). This allows prerenderToNodeStream() to return a "postponed"
 * object that can be passed to resumeToPipeableStream() at request time.
 *
 * The key insight: React's resume mechanism only re-renders the postponed
 * subtrees, NOT the entire component tree. This is more efficient than a full
 * re-render.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import React from 'react';

// Import the static prerender API (this is the key!)
import { prerenderToNodeStream } from 'react-dom/static';

import { App } from './components/App.js';
import { renderStorage, createPrerenderStore } from './async-storage.js';

/**
 * Render the app and capture the static shell + postponed state
 */
async function renderStaticShell(prerenderStore) {
  // Create an AbortController to trigger postpone capture
  const controller = new AbortController();

  // Collect the HTML chunks
  const chunks = [];

  // Run the render inside our prerender context
  const resultPromise = renderStorage.run(prerenderStore, async () => {
    // Start the prerender - this returns { prelude, postponed }
    const pendingResult = prerenderToNodeStream(
      React.createElement(App),
      {
        signal: controller.signal,
        onError(error) {
          // Log errors but don't reject - abort errors are expected
          if (!error.message?.includes('abort')) {
            console.error('   ❌ Render error:', error.message);
          }
        }
      }
    );

    // Give components a moment to start suspending, then abort
    // This triggers React to capture the postponed state
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('   ⏱️  Aborting prerender to capture postponed state...');
    controller.abort('Prerender complete - capturing postponed state');

    // Wait for the result
    const result = await pendingResult;

    console.log('   📦 Prerender complete!');
    console.log(`   📊 Has postponed state: ${result.postponed !== null}`);

    // Read the prelude stream into chunks
    const prelude = result.prelude;
    for await (const chunk of prelude) {
      chunks.push(chunk);
    }

    const html = Buffer.concat(chunks).toString('utf-8');

    return {
      html,
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
  console.log(' PPR BUILD - Generating Static Shell');
  console.log('='.repeat(70));
  console.log('');

  // =========================================================================
  // STEP 1: Create the prerender store
  // =========================================================================
  const prerenderStore = createPrerenderStore();

  console.log('📦 Step 1: Created prerender store');
  console.log('   Store type:', prerenderStore.type);
  console.log('');

  // =========================================================================
  // STEP 2: Prerender the app
  // =========================================================================
  console.log('🔨 Step 2: Running React prerender...');
  console.log('');

  let result;

  try {
    result = await renderStaticShell(prerenderStore);
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }

  const { html: htmlContent, postponed: postponedState } = result;

  // =========================================================================
  // STEP 3: Analyze the results
  // =========================================================================
  console.log('');
  console.log('📊 Step 3: Analyzing prerender results...');
  console.log('');

  const dynamicAccesses = prerenderStore.dynamicAccesses;
  const hasDynamicContent = dynamicAccesses.length > 0;
  const hasPostponedState = postponedState !== null;

  if (dynamicAccesses.length > 0) {
    console.log('   ⚡ Dynamic APIs detected during prerender:');
    dynamicAccesses.forEach((access, i) => {
      console.log(`      ${i + 1}. ${access.expression}`);
    });
    console.log('');
    console.log('   These components suspended and show Suspense fallbacks.');
    console.log('   At request time, resumeToPipeableStream() will render them.');
  } else {
    console.log('   ✅ No dynamic APIs detected - page is fully static!');
  }

  if (hasPostponedState) {
    console.log('');
    console.log('   🎯 POSTPONED STATE CAPTURED!');
    console.log('      This enables resume() at request time.');
  }
  console.log('');

  // =========================================================================
  // STEP 4: Save the static shell and postponed state
  // =========================================================================
  console.log('💾 Step 4: Saving build artifacts...');
  console.log('');

  mkdirSync('./dist', { recursive: true });

  writeFileSync('./dist/shell.html', htmlContent, 'utf-8');
  console.log('   ✅ Saved: dist/shell.html');

  const metadata = {
    hasDynamicContent,
    hasPostponedState,
    dynamicAccesses: dynamicAccesses.map(a => a.expression),
    buildTime: new Date().toISOString(),
  };
  writeFileSync('./dist/metadata.json', JSON.stringify(metadata, null, 2), 'utf-8');
  console.log('   ✅ Saved: dist/metadata.json');

  // Save the postponed state if we have it
  if (hasPostponedState) {
    writeFileSync('./dist/postponed.json', JSON.stringify(postponedState), 'utf-8');
    console.log('   ✅ Saved: dist/postponed.json (for resume at request time)');
  }

  // =========================================================================
  // STEP 5: Print summary
  // =========================================================================
  console.log('');
  console.log('='.repeat(70));
  console.log(' BUILD COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  console.log('Output files:');
  console.log('  📄 dist/shell.html      - The static shell (with fallbacks)');
  console.log('  📄 dist/metadata.json   - Build metadata');
  if (hasPostponedState) {
    console.log('  📄 dist/postponed.json  - Postponed state for resume()');
  }
  console.log('');
  console.log(`Page type: ${hasDynamicContent ? 'PARTIAL (has dynamic holes)' : 'FULLY STATIC'}`);
  if (hasPostponedState) {
    console.log('Resume:    ENABLED (will use resumeToPipeableStream at request time)');
  }
  console.log('');
  console.log('To start the server:');
  console.log('  npm start');
  console.log('');
  console.log('Then visit: http://localhost:3000');
  console.log('');

  // Show a preview of the shell
  console.log('='.repeat(70));
  console.log(' STATIC SHELL PREVIEW');
  console.log('='.repeat(70));
  console.log('');

  if (htmlContent.includes('Loading personalized')) {
    console.log('Notice the loading skeleton where dynamic content will go:');
    console.log('');
  }

  console.log(htmlContent.slice(0, 2000));
  if (htmlContent.length > 2000) {
    console.log('');
    console.log('... (truncated)');
  }
  console.log('');
}

build().catch(console.error);
