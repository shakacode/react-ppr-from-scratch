/**
 * =============================================================================
 * SERVER - Request-Time PPR with REAL Resume
 * =============================================================================
 *
 * This server demonstrates TRUE Partial Prerendering using React's resume API.
 *
 * THE PPR FLOW:
 * -------------
 * For FULLY STATIC pages (no dynamic APIs called):
 * - Just send the prerendered HTML (fastest!)
 *
 * For pages with POSTPONED state (dynamic content):
 * - Load the postponed state from build time
 * - Call resumeToPipeableStream() with postponed state + real request data
 * - React renders ONLY the dynamic parts (static shell is NOT re-rendered!)
 * - Stream the dynamic content to fill in the holes
 *
 * WHY THIS IS EFFICIENT:
 * ----------------------
 * The resume mechanism is more efficient than a full re-render because:
 * - Static components are NEVER re-rendered at request time
 * - Only the postponed subtrees are processed
 * - React knows exactly where to inject the dynamic content
 *
 * This is achieved using a custom React build with enableHalt=true.
 */

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';

// Import streaming SSR APIs (including resume!)
import { renderToPipeableStream, resumeToPipeableStream } from 'react-dom/server';

import { App } from './components/App.js';
import { renderStorage, createRequestStore } from './async-storage.js';

const app = express();
const PORT = 3000;

/**
 * Main request handler - This is where PPR happens!
 */
app.get('/', async (req, res) => {
  console.log('');
  console.log('='.repeat(60));
  console.log(' INCOMING REQUEST');
  console.log('='.repeat(60));
  console.log('');
  console.log('Cookies:', req.headers.cookie || '(none)');
  console.log('');

  // =========================================================================
  // STEP 1: Check if we have a prerendered shell and postponed state
  // =========================================================================

  let metadata = null;
  let postponedState = null;

  if (existsSync('./dist/metadata.json')) {
    metadata = JSON.parse(readFileSync('./dist/metadata.json', 'utf-8'));
    console.log('📄 Step 1: Found prerendered page');
    console.log(`   Has dynamic content: ${metadata.hasDynamicContent ? 'YES' : 'NO'}`);
    console.log(`   Has postponed state: ${metadata.hasPostponedState ? 'YES' : 'NO'}`);

    // Load postponed state if available
    if (metadata.hasPostponedState && existsSync('./dist/postponed.json')) {
      postponedState = JSON.parse(readFileSync('./dist/postponed.json', 'utf-8'));
      console.log('   ✅ Loaded postponed state for resume');
    }
  } else {
    console.log('⚠️  No prerendered shell found. Run `npm run build` first!');
  }

  console.log('');

  // =========================================================================
  // STEP 2: Handle the request based on page type
  // =========================================================================

  if (metadata && !metadata.hasDynamicContent) {
    // =========================================================================
    // FULLY STATIC PAGE - Just send the prerendered HTML
    // =========================================================================
    //
    // This is the ideal case! The page has no dynamic APIs, so we can serve
    // the prerendered HTML directly. Fastest possible response.
    //
    // =========================================================================

    console.log('📄 Step 2: Page is fully static, sending prerendered HTML');
    console.log('');

    const shellHtml = readFileSync('./dist/shell.html', 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(shellHtml);

  } else if (postponedState) {
    // =========================================================================
    // PPR WITH RESUME - The real magic!
    // =========================================================================
    //
    // This is where PPR shines:
    // - We DON'T re-render the static shell
    // - We ONLY render the postponed (dynamic) parts
    // - React knows exactly where to inject the content
    //
    // =========================================================================

    console.log('🚀 Step 2: Using resumeToPipeableStream() for TRUE PPR...');
    console.log('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Create a request store with the actual HTTP request
    const requestStore = createRequestStore(req);

    // Resume rendering from the postponed state
    await new Promise((resolve, reject) => {
      renderStorage.run(requestStore, () => {
        const { pipe } = resumeToPipeableStream(
          React.createElement(App),
          postponedState,
          {
            onShellReady() {
              console.log('   📦 Resume shell ready, streaming dynamic content...');
              pipe(res);
            },
            onAllReady() {
              console.log('   ✨ All dynamic content rendered!');
              console.log('');
              console.log('   💡 Note: Static parts were NOT re-rendered.');
              console.log('      Only the postponed subtrees were processed.');
              console.log('');
              resolve();
            },
            onShellError(error) {
              console.error('Shell error:', error);
              reject(error);
            },
            onError(error) {
              console.error('Render error:', error);
            }
          }
        );
      });
    });

  } else {
    // =========================================================================
    // FALLBACK - Full render (no postponed state available)
    // =========================================================================

    console.log('🔄 Step 2: No postponed state, doing full render...');
    console.log('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const requestStore = createRequestStore(req);

    await new Promise((resolve, reject) => {
      renderStorage.run(requestStore, () => {
        const { pipe } = renderToPipeableStream(
          React.createElement(App),
          {
            onShellReady() {
              console.log('   📦 Shell ready, streaming to client...');
              pipe(res);
            },
            onAllReady() {
              console.log('   ✨ All content rendered');
              console.log('');
              resolve();
            },
            onShellError(error) {
              console.error('Shell error:', error);
              reject(error);
            },
            onError(error) {
              console.error('Render error:', error);
            }
          }
        );
      });
    });
  }
});

/**
 * Endpoint to set a test cookie (login)
 */
app.get('/login', (req, res) => {
  const username = req.query.name || 'TestUser';
  res.setHeader('Set-Cookie', `username=${username}; Path=/; HttpOnly`);
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Logged In</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 40px;
            background: #f0f0f0;
          }
          .card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            max-width: 400px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          a { color: #00d4ff; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>✅ Logged in as "${username}"</h1>
          <p>Cookie set! Now <a href="/">go back to the homepage</a> to see personalized content.</p>
          <p style="color: #666; font-size: 14px;">
            The greeting should now show your name instead of "Guest".
          </p>
        </div>
      </body>
    </html>
  `);
});

/**
 * Endpoint to clear the cookie (logout)
 */
app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'username=; Path=/; HttpOnly; Max-Age=0');
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Logged Out</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 40px;
            background: #f0f0f0;
          }
          .card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            max-width: 400px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          a { color: #00d4ff; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>👋 Logged out</h1>
          <p>Cookie cleared! <a href="/">Go back to the homepage</a> to see the Guest greeting.</p>
        </div>
      </body>
    </html>
  `);
});

// Start the server
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log(' PPR DEMO SERVER (with REAL Resume!)');
  console.log('='.repeat(60));
  console.log('');
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log('');
  console.log('Available routes:');
  console.log('  GET /           - Main page (PPR demo with resume)');
  console.log('  GET /login?name=X - Set username cookie');
  console.log('  GET /logout     - Clear the cookie');
  console.log('');
  console.log('Try this:');
  console.log('  1. Visit http://localhost:3000 (see "Guest" greeting)');
  console.log('  2. Visit http://localhost:3000/login?name=Alice');
  console.log('  3. Visit http://localhost:3000 again (see "Alice" greeting)');
  console.log('');
  console.log('Watch this terminal for request logs!');
  console.log('');
});
