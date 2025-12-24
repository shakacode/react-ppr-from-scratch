/**
 * =============================================================================
 * APP - The Root Component (Assembling Static + Dynamic Parts)
 * =============================================================================
 *
 * This is where the magic of PPR becomes visible!
 *
 * COMPONENT TREE STRUCTURE:
 * -------------------------
 *
 *   <App>                              ← Static (just a container)
 *     <Header />                       ← Static (prerendered)
 *
 *     <Suspense fallback={...}>        ← The PPR boundary!
 *       <UserGreeting />               ← Dynamic (uses cookies)
 *     </Suspense>
 *
 *     <ProductList />                  ← Static (prerendered)
 *     <Footer />                       ← Static (prerendered)
 *   </App>
 *
 *
 * HOW THE HTML LOOKS AFTER PRERENDER (Static Shell):
 * --------------------------------------------------
 *
 *   <html>
 *     <body>
 *       <header>PPR Demo Store</header>     ← Static content
 *
 *       <!--$?-->                           ← Suspense boundary marker
 *       <template id="B:0">                 ← Template for replacement
 *         <div>Loading...</div>             ← Fallback content
 *       </template>
 *       <!--/$-->
 *
 *       <section>Our Products...</section>  ← Static content
 *       <footer>© 2024...</footer>          ← Static content
 *     </body>
 *   </html>
 *
 *
 * HOW STREAMING FILLS IN THE DYNAMIC HOLE:
 * ----------------------------------------
 *
 * When the dynamic content is ready, React streams:
 *
 *   <div hidden id="S:0">
 *     <div>👋 Welcome back, John!</div>     ← The actual dynamic content
 *   </div>
 *   <script>
 *     // Swap the template with the real content
 *     $RC("B:0", "S:0")
 *   </script>
 *
 * This script runs on the client and replaces the fallback with real content.
 */

import React, { Suspense } from 'react';
import { Header } from './Header.js';
import { Footer } from './Footer.js';
import { ProductList } from './ProductList.js';
import { UserGreeting, UserGreetingFallback } from './UserGreeting.js';
import { AsyncComponent } from './AsyncComponent.js';

export function App() {
  const promise = new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
  return React.createElement('html', { lang: 'en' }, [
    React.createElement('head', { key: 'head' }, [
      React.createElement('meta', { key: 'charset', charSet: 'utf-8' }),
      React.createElement('meta', {
        key: 'viewport',
        name: 'viewport',
        content: 'width=device-width, initial-scale=1'
      }),
      React.createElement('title', { key: 'title' }, 'PPR Demo - Partial Prerendering'),
      React.createElement('style', { key: 'style' }, `
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background-color: #f0f0f0;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
      `)
    ]),

    React.createElement('body', { key: 'body' },
      React.createElement('div', { className: 'container' }, [
        // =====================================================================
        // STATIC: Header - Prerendered at build time
        // =====================================================================
        React.createElement(Header, { key: 'header' }),
        // =====================================================================
        
        // =====================================================================
        // ASYNC COMPONENT - Simulates an async operation
        // =====================================================================
        React.createElement(Suspense, { key: 'async-suspense', fallback: React.createElement('div', null, 'Loading async component...') },  React.createElement(AsyncComponent, { key: 'async', promise })),

        // =====================================================================
        // DYNAMIC: User Greeting - Rendered at request time
        //
        // The Suspense boundary is CRITICAL here!
        // It tells React: "This part might be async. If it is, show the
        // fallback until it's ready."
        //
        // During prerender, when UserGreeting calls cookies(), React will
        // postpone this subtree and render the fallback into the static shell.
        // =====================================================================
        React.createElement(Suspense, {
          key: 'user-greeting',
          fallback: React.createElement(UserGreetingFallback)
        },
          React.createElement(UserGreeting)
        ),

        // =====================================================================
        // STATIC: Product List - Prerendered at build time
        // =====================================================================
        React.createElement(ProductList, { key: 'products' }),

        // =====================================================================
        // STATIC: Footer - Prerendered at build time
        // =====================================================================
        React.createElement(Footer, { key: 'footer' }),
      ])
    )
  ]);
}
