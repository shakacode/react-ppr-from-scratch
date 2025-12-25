/**
 * =============================================================================
 * ASYNC COMPONENT - Component-Level Caching
 * =============================================================================
 *
 * This demonstrates TWO approaches to caching:
 *
 * 1. DATA-LEVEL CACHING (using cached())
 *    - Only the data-fetching function is cached
 *    - Component still re-renders, but with cached data
 *
 * 2. COMPONENT-LEVEL CACHING (using cachedComponent())
 *    - The ENTIRE component output (React elements) is cached
 *    - No re-rendering on cache hit - cached elements returned directly
 *
 * Next.js uses component-level caching with 'use cache' directive,
 * serializing React elements using the Flight protocol (RSC).
 */

import React from 'react';
import { cachedComponent } from '../cache.js';

/**
 * The raw async component (before caching)
 *
 * This is what would be written with 'use cache' in Next.js:
 *
 *   async function AsyncComponent() {
 *     'use cache'
 *     // ... async work ...
 *     return <div>...</div>
 *   }
 */
async function AsyncComponentImpl() {
  // Simulate slow async work (1 second)
  console.log('      ⏳ AsyncComponent: Starting 1-second delay...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('      ✅ AsyncComponent: Delay complete!');

  // Return React elements - these will be cached!
  return React.createElement('div', {
    style: {
      backgroundColor: '#e8f5e9',
      padding: '15px',
      borderRadius: '8px',
      border: '2px solid #4caf50',
      marginBottom: '20px',
    }
  }, [
    React.createElement('h3', {
      key: 'title',
      style: { margin: '0 0 10px 0', color: '#2e7d32' }
    }, '⚡ Async Component (Component-Level Cache)'),

    React.createElement('p', {
      key: 'time',
      style: { margin: '0 0 5px 0', color: '#555' }
    }, `Rendered at: ${new Date().toISOString()}`),

    React.createElement('p', {
      key: 'note',
      style: { margin: 0, fontSize: '12px', color: '#888', fontStyle: 'italic' }
    }, 'The ENTIRE React element tree is cached, not just data!')
  ]);
}

/**
 * Wrap with cachedComponent() - caches the entire rendered output
 *
 * On cache HIT:
 * - No component code runs
 * - Cached React elements returned directly
 * - Much faster than data-level caching!
 */
export const AsyncComponent = cachedComponent('async-component', AsyncComponentImpl);

/**
 * Fallback component
 */
export function AsyncComponentFallback() {
  return React.createElement('div', {
    style: {
      backgroundColor: '#fff3e0',
      padding: '15px',
      borderRadius: '8px',
      border: '2px solid #ff9800',
      marginBottom: '20px',
    }
  }, [
    React.createElement('h3', {
      key: 'title',
      style: { margin: '0 0 10px 0', color: '#e65100' }
    }, '⏳ Loading Async Component...'),

    React.createElement('p', {
      key: 'note',
      style: { margin: 0, fontSize: '12px', color: '#888' }
    }, 'This fallback appears during the prospective render.')
  ]);
}
