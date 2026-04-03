import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './Root';
import './index.css';

const browserConsoleFlag = '__GITPULSE_ASCII_PRINTED__';

if (!window[browserConsoleFlag]) {
  console.log(String.raw`
  ____ _ _   ____       _
 / ___(_) |_|  _ \ _   _| |___  ___
| |  _| | __| |_) | | | | / __|/ _ \\
| |_| | | |_|  __/| |_| | \__ \  __/
 \____|_|\__|_|    \__,_|_|___/\___|
  `);
  console.log('GitPulse loaded in browser console.');
  window[browserConsoleFlag] = true;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore service worker registration failures in unsupported environments.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);