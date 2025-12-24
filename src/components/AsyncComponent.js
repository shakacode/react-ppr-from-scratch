import React from 'react';
import { getCurrentTime } from '../static-apis.js';

export async function AsyncComponent({ promise }) {
  await promise;
  const time = getCurrentTime();

  return React.createElement('div', {
    style: {
      backgroundColor: '#f9f9f9',
      padding: '15px',
      borderRadius: '8px',
      border: '1px solid #ddd',
      marginBottom: '20px',
    }
  }, [
    React.createElement('h3', {
      key: 'title',
      style: { margin: '0 0 10px 0' }
    }, '⏳ Async Component Loaded!'),

    React.createElement('p', {
      key: 'time',
      style: { margin: 0, color: '#555' }
    }, `This component was rendered at: ${time}`)
  ]);
}
