/**
 * =============================================================================
 * USER GREETING - A Dynamic Component ⚡
 * =============================================================================
 *
 * THIS IS THE INTERESTING ONE!
 *
 * This component is DYNAMIC because it calls cookies() to read the user's name.
 * Different users will see different content based on their cookies.
 *
 * WHAT HAPPENS DURING PPR:
 * ------------------------
 *
 * 1. BUILD TIME (Prerender):
 *    - React starts rendering the component tree
 *    - When it reaches UserGreeting, it tries to render it
 *    - UserGreeting calls cookies()
 *    - cookies() detects we're in prerender mode
 *    - cookies() calls React.unstable_postpone("cookies() was called")
 *    - React pauses here and creates a "hole" in the HTML
 *    - The Suspense boundary's fallback is rendered instead
 *    - React saves the component's state for later
 *
 * 2. REQUEST TIME (Resume):
 *    - User visits the page
 *    - Server sends the prerendered static shell immediately
 *    - React.resume() continues rendering where it left off
 *    - UserGreeting calls cookies() again
 *    - cookies() detects we're in request mode
 *    - cookies() returns the actual cookies from the request
 *    - The component renders with the real user data
 *    - This HTML is streamed to the client to fill the "hole"
 *
 * THE SUSPENSE BOUNDARY IS CRITICAL:
 * ----------------------------------
 * Without <Suspense>, a dynamic component would block the ENTIRE page.
 * With <Suspense>, only this component is dynamic - everything else is static.
 */

import React from 'react';
import { cookies, getCurrentTime } from '../dynamic-apis.js';

export async function UserGreeting() {
  // This is the line that makes us dynamic!
  // Try commenting it out and the component becomes static.
  const cookieStore = await cookies();
  const username = cookieStore.get('username')?.value || 'Guest';

  // Also get the current time to show another dynamic value
  const time = await getCurrentTime();

  return React.createElement('div', {
    style: {
      backgroundColor: '#e8f4f8',
      padding: '20px',
      borderRadius: '8px',
      border: '2px solid #00d4ff',
      marginBottom: '20px',
    }
  }, [
    React.createElement('h2', {
      key: 'greeting',
      style: { margin: '0 0 10px 0' }
    }, `👋 Welcome back, ${username}!`),

    React.createElement('p', {
      key: 'time',
      style: { margin: '0 0 10px 0', color: '#666' }
    }, `Current server time: ${time}`),

    React.createElement('p', {
      key: 'note',
      style: {
        fontSize: '12px',
        color: '#e74c3c',
        margin: 0,
        fontWeight: 'bold',
      }
    }, '⚡ This section is DYNAMIC - it was rendered at request time using cookies()')
  ]);
}

/**
 * LOADING FALLBACK - Shown while the dynamic content loads
 *
 * This is what users see in the initial static shell.
 * It gets replaced when the dynamic content streams in.
 */
export function UserGreetingFallback() {
  return React.createElement('div', {
    style: {
      backgroundColor: '#f0f0f0',
      padding: '20px',
      borderRadius: '8px',
      border: '2px dashed #ccc',
      marginBottom: '20px',
    }
  }, [
    React.createElement('div', {
      key: 'skeleton',
      style: {
        height: '24px',
        width: '200px',
        backgroundColor: '#ddd',
        borderRadius: '4px',
        marginBottom: '10px',
      }
    }),

    React.createElement('div', {
      key: 'skeleton2',
      style: {
        height: '16px',
        width: '150px',
        backgroundColor: '#ddd',
        borderRadius: '4px',
      }
    }),

    React.createElement('p', {
      key: 'note',
      style: {
        fontSize: '12px',
        color: '#999',
        margin: '10px 0 0 0',
      }
    }, '⏳ Loading personalized content...')
  ]);
}
