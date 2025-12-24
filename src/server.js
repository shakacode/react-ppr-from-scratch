/**
 * =============================================================================
 * SERVER - Request-Time Rendering
 * =============================================================================
 *
 * This server handles request-time rendering for our PPR demo.
 *
 * IMPORTANT CONTEXT:
 * ------------------
 * React's true resume() API requires postponed state from prerenderToNodeStream(),
 * but that only works when enablePostpone = true (which is DISABLED in npm builds).
 *
 * So our approach is:
 *
 * For FULLY STATIC pages (no dynamic APIs called):
 * - Just send the prerendered HTML (fastest!)
 *
 * For pages with DYNAMIC content:
 * - Do a fresh render at request time with real request data
 * - Dynamic components now have access to cookies, headers, etc.
 * - Stream the result to the client
 *
 * HOW NEXT.JS IS DIFFERENT:
 * -------------------------
 * Next.js uses a custom React build where enablePostpone = true.
 * This enables the TRUE PPR flow:
 * 1. Build creates postponed state via prerenderToNodeStream()
 * 2. Server calls resume(postponedState) at request time
 * 3. React renders ONLY the postponed subtrees (not the whole tree!)
 *
 * Our demo achieves the same USER-FACING result, but internally does a full
 * re-render instead of resume. The user sees the same fast initial shell +
 * streamed dynamic content.
 */

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';

// Import streaming SSR API
import { renderToPipeableStream } from 'react-dom/server';
// NOTE: resume() exists but requires postponed state from prerenderToNodeStream(),
// which only works with enablePostpone=true (disabled in npm builds)

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
  // STEP 1: Check if we have a prerendered shell
  // =========================================================================

  let metadata = null;

  if (existsSync('./dist/metadata.json')) {
    metadata = JSON.parse(readFileSync('./dist/metadata.json', 'utf-8'));
    console.log('📄 Step 1: Found prerendered page');
    console.log(`   Has dynamic content: ${metadata.hasDynamicContent ? 'YES' : 'NO'}`);
    if (metadata.hasDynamicContent) {
      console.log(`   Dynamic APIs: ${metadata.dynamicAccesses.join(', ')}`);
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

  } else {
    // =========================================================================
    // DYNAMIC PAGE - Full render with real request data
    // =========================================================================
    //
    // The page has dynamic content (components that call cookies(), headers(),
    // etc.). We need to render with real request data.
    //
    // NOTE: Next.js would use resume() here with postponed state, which only
    // re-renders the dynamic subtrees. Since enablePostpone is disabled in
    // npm React builds, we do a full re-render instead. The user experience
    // is the same - they see the static shell instantly with streaming
    // dynamic content.
    //
    // =========================================================================

    console.log('🔄 Step 2: Page has dynamic content, rendering with request data...');
    console.log('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Create a request store with the actual HTTP request
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
  console.log(' PPR DEMO SERVER');
  console.log('='.repeat(60));
  console.log('');
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log('');
  console.log('Available routes:');
  console.log('  GET /           - Main page (PPR demo)');
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
