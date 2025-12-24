/**
 * =============================================================================
 * BUILD SCRIPT - Generating the Static Shell at Build Time
 * =============================================================================
 *
 * This demonstrates how PPR builds a static shell with "holes" for dynamic content.
 *
 * THE APPROACH:
 * -------------
 * 1. Start prerendering the component tree using renderToPipeableStream
 * 2. Dynamic components (those calling cookies(), etc.) will suspend forever
 * 3. When the shell is ready (static content + Suspense fallbacks), we capture it
 * 4. We abort the render after a short timeout (don't wait for suspended components)
 * 5. Save the static shell for serving at request time
 *
 * WHY NOT use prerenderToNodeStream + resume()?
 * ---------------------------------------------
 * React's true postpone mechanism (which enables resume) is gated behind the
 * enablePostpone flag, which is DISABLED in all npm React builds.
 * Only Next.js's custom React build has it enabled.
 *
 * So we use the Suspense-based approach, which achieves the same user-facing
 * result but requires a full re-render at request time instead of resume.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import React from 'react';

// Import the streaming SSR API
import { renderToPipeableStream } from 'react-dom/server';

import { App } from './components/App.js';
import { renderStorage, createPrerenderStore } from './async-storage.js';

/**
 * Render the app and capture the static shell
 */
async function renderStaticShell(prerenderStore) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    // Create a Node.js PassThrough stream to capture the HTML
    const passthrough = new PassThrough();

    passthrough.on('data', chunk => {
      chunks.push(chunk);
    });

    passthrough.on('end', () => {
      const html = Buffer.concat(chunks).toString('utf-8');
      resolve(html);
    });

    passthrough.on('error', reject);

    // Run the render inside our prerender context
    renderStorage.run(prerenderStore, () => {
      const { pipe, abort } = renderToPipeableStream(
        React.createElement(App),
        {
          onShellReady() {
            console.log('   📦 Shell is ready (static content + fallbacks)');

            // Start streaming to our buffer
            pipe(passthrough);

            // Abort after a short delay to prevent waiting for suspended components
            // The suspended components will show their Suspense fallbacks
            setTimeout(() => {
              console.log('   ⏱️  Aborting prerender (dynamic content suspended)');
              abort();
            }, 100);
          },
          onShellError(error) {
            console.error('Shell error:', error);
            reject(error);
          },
          onError(error) {
            // Ignore expected errors from abort
            if (error.message?.includes('aborted') ||
                error.message?.includes('The render was aborted')) {
              return;
            }
            console.error('Render error:', error);
          },
          onAllReady() {
            // This means NO components suspended - page is fully static
            console.log('   ✨ All content ready (page is fully static!)');
          }
        }
      );
    });
  });
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

  let htmlContent;

  try {
    htmlContent = await renderStaticShell(prerenderStore);
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }

  // =========================================================================
  // STEP 3: Analyze the results
  // =========================================================================
  console.log('');
  console.log('📊 Step 3: Analyzing prerender results...');
  console.log('');

  const dynamicAccesses = prerenderStore.dynamicAccesses;
  const hasDynamicContent = dynamicAccesses.length > 0;

  if (dynamicAccesses.length > 0) {
    console.log('   ⚡ Dynamic APIs detected during prerender:');
    dynamicAccesses.forEach((access, i) => {
      console.log(`      ${i + 1}. ${access.expression}`);
    });
    console.log('');
    console.log('   These components suspended and show Suspense fallbacks.');
    console.log('   At request time, they will render with real data.');
  } else {
    console.log('   ✅ No dynamic APIs detected - page is fully static!');
  }
  console.log('');

  // =========================================================================
  // STEP 4: Save the static shell
  // =========================================================================
  console.log('💾 Step 4: Saving static shell to disk...');
  console.log('');

  mkdirSync('./dist', { recursive: true });

  writeFileSync('./dist/shell.html', htmlContent, 'utf-8');
  console.log('   ✅ Saved: dist/shell.html');

  const metadata = {
    hasDynamicContent,
    dynamicAccesses: dynamicAccesses.map(a => a.expression),
    buildTime: new Date().toISOString(),
  };
  writeFileSync('./dist/metadata.json', JSON.stringify(metadata, null, 2), 'utf-8');
  console.log('   ✅ Saved: dist/metadata.json');

  // =========================================================================
  // STEP 5: Print summary
  // =========================================================================
  console.log('');
  console.log('='.repeat(70));
  console.log(' BUILD COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  console.log('Output files:');
  console.log('  📄 dist/shell.html    - The static shell (with fallbacks)');
  console.log('  📄 dist/metadata.json - Build metadata');
  console.log('');
  console.log(`Page type: ${hasDynamicContent ? 'PARTIAL (has dynamic holes)' : 'FULLY STATIC'}`);
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
