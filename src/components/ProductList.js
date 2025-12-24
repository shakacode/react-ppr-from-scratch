/**
 * =============================================================================
 * PRODUCT LIST - A Static Component
 * =============================================================================
 *
 * This component displays a list of products.
 *
 * WHY IS THIS STATIC?
 * -------------------
 * Even though this looks like it could be dynamic (fetching from a database),
 * the products are the same for all users. The data doesn't depend on:
 * - Who the user is (no cookies check)
 * - The current request headers
 * - Any user-specific personalization
 *
 * In a real app, you might fetch this from a CMS or database during build,
 * and it would still be static (can be cached and reused).
 */

import React from 'react';
import { getCurrentTime } from '../static-apis.js';

// Simulated static product data
const products = [
  { id: 1, name: 'Mechanical Keyboard', price: 149.99, emoji: '⌨️' },
  { id: 2, name: 'Wireless Mouse', price: 79.99, emoji: '🖱️' },
  { id: 3, name: 'USB-C Hub', price: 59.99, emoji: '🔌' },
  { id: 4, name: '4K Monitor', price: 399.99, emoji: '🖥️' },
  { id: 5, name: getCurrentTime(), price: 399.99, emoji: '🖥️' },
];

export function ProductList() {
  return React.createElement('section', {
    style: {
      padding: '20px',
      backgroundColor: '#f5f5f5',
      borderRadius: '8px',
    }
  }, [
    React.createElement('h2', {
      key: 'title',
      style: { marginTop: 0 }
    }, '📦 Our Products'),

    React.createElement('p', {
      key: 'note',
      style: { color: '#666', fontSize: '14px' }
    }, '(This section is static - same for all users, prerendered at build time)'),

    React.createElement('div', {
      key: 'grid',
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '20px',
        marginTop: '20px',
      }
    },
      products.map(product =>
        React.createElement('div', {
          key: product.id,
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }
        }, [
          React.createElement('div', {
            key: 'emoji',
            style: { fontSize: '48px', textAlign: 'center' }
          }, product.emoji),

          React.createElement('h3', {
            key: 'name',
            style: { margin: '10px 0 5px 0', textAlign: 'center' }
          }, product.name),

          React.createElement('p', {
            key: 'price',
            style: {
              color: '#2ecc71',
              fontWeight: 'bold',
              textAlign: 'center',
              margin: 0,
            }
          }, `$${product.price}`)
        ])
      )
    )
  ]);
}
