/**
 * =============================================================================
 * HEADER - A Static Component
 * =============================================================================
 *
 * This component is STATIC because:
 * - It doesn't call any dynamic APIs (cookies, headers, etc.)
 * - Its output is the same for every request
 * - It can be fully rendered at build time
 *
 * In PPR terms: This will be part of the "static shell" that gets prerendered.
 */

import React from 'react';
import { getCurrentTime } from '../static-apis.js';

export function Header() {
  // Everything here is static - no dynamic APIs used
  const navItems = ['Home', 'Products', 'About', 'Contact', getCurrentTime()];

  return React.createElement('header', {
    style: {
      backgroundColor: '#1a1a2e',
      color: 'white',
      padding: '20px',
      marginBottom: '20px',
    }
  }, [
    React.createElement('h1', {
      key: 'title',
      style: { margin: '0 0 10px 0' }
    }, '🛒 PPR Demo Store'),

    React.createElement('nav', { key: 'nav' },
      React.createElement('ul', {
        style: {
          display: 'flex',
          gap: '20px',
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }
      },
        navItems.map(item =>
          React.createElement('li', { key: item },
            React.createElement('a', {
              href: '#',
              style: { color: '#00d4ff', textDecoration: 'none' }
            }, item)
          )
        )
      )
    )
  ]);
}
