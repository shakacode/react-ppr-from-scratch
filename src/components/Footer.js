/**
 * =============================================================================
 * FOOTER - A Static Component
 * =============================================================================
 *
 * Another static component - no dynamic API usage.
 * Will be prerendered into the static shell.
 */

import React from 'react';

export function Footer() {
  // Static content - same for all users
  return React.createElement('footer', {
    style: {
      backgroundColor: '#1a1a2e',
      color: '#888',
      padding: '20px',
      marginTop: '20px',
      textAlign: 'center',
    }
  }, [
    React.createElement('p', { key: 'copyright' },
      '© 2024 PPR Demo Store. Built to demonstrate Partial Prerendering.'
    ),
    React.createElement('p', {
      key: 'note',
      style: { fontSize: '12px', marginTop: '10px' }
    },
      '⚡ The header, products, and footer were prerendered at build time (static shell)'
    )
  ]);
}
