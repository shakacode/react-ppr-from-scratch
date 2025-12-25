# How Partial Prerendering Works Under the Hood

This document provides a deep dive into the internals of Partial Prerendering (PPR), explaining how Next.js implements it and how this demo replicates that behavior.

## Table of Contents

1. [The Problem PPR Solves](#the-problem-ppr-solves)
2. [Core Concepts](#core-concepts)
3. [The Two-Phase Prerendering Model](#the-two-phase-prerendering-model)
4. [CacheSignal: Tracking Async Work](#cachesignal-tracking-async-work)
5. [Component-Level Caching](#component-level-caching)
6. [Dynamic APIs and Postpone](#dynamic-apis-and-postpone)
7. [The Resume Mechanism](#the-resume-mechanism)
8. [Putting It All Together](#putting-it-all-together)
9. [React APIs Used](#react-apis-used)

---

## The Problem PPR Solves

### Traditional SSR Approaches

**Fully Static (SSG)**
```
Build Time: Render entire page → Save HTML
Request Time: Serve cached HTML (fast!)
Problem: Can't have personalized content
```

**Fully Dynamic (SSR)**
```
Request Time: Render entire page → Send HTML
Problem: Slow TTFB, can't cache anything
```

**ISR (Incremental Static Regeneration)**
```
Build Time: Render page → Cache HTML
Request Time: Serve cache, revalidate in background
Problem: Still can't mix static + dynamic in same page
```

### The PPR Solution

PPR combines static and dynamic in a **single page**:

```
Build Time:
  ├── Render static parts → Cache as "shell"
  └── Mark dynamic parts → Save as "postponed state"

Request Time:
  ├── Send static shell immediately (fast TTFB!)
  └── Stream dynamic parts to fill holes
```

---

## Core Concepts

### 1. Static Shell

The static shell is the prerendered HTML that's the same for all users:

```html
<!DOCTYPE html>
<html>
  <body>
    <header>My Store</header>           <!-- Static -->
    <div class="product">...</div>       <!-- Static -->

    <!--$?-->                            <!-- Dynamic hole marker -->
    <template id="B:0"></template>       <!-- Placeholder for dynamic content -->
    <div class="skeleton">Loading...</div>
    <!--/$-->

    <footer>© 2024</footer>              <!-- Static -->
  </body>
</html>
```

### 2. Postponed State

When React encounters a dynamic component, it captures the render state:

```javascript
const postponedState = {
  // Internal React data structure containing:
  // - Where in the tree the dynamic holes are
  // - What Suspense boundaries wrap them
  // - Component references to resume rendering
}
```

### 3. Dynamic Holes

Dynamic holes are places where personalized content will be streamed:

```javascript
// At build time, this component "postpones"
function UserGreeting() {
  const user = await cookies().get('user');  // Can't know at build time!
  return <div>Welcome, {user}!</div>;
}

// The hole is marked with special HTML comments
// <!--$?--> ... <!--/$-->
```

---

## The Two-Phase Prerendering Model

This is the key insight into how Next.js handles async components with caching.

### Why Two Phases?

Consider this component:

```javascript
async function ProductRecommendations() {
  'use cache'
  const products = await fetchProducts();  // Takes 2 seconds
  return <ProductGrid products={products} />;
}
```

**Problem**: React's prerender has a timing window. If `fetchProducts()` takes too long, React won't wait forever.

**Solution**: Run two renders!

### Phase 1: Prospective Render (Cache Filling)

```
┌─────────────────────────────────────────────────────────────┐
│  PURPOSE: Discover and fill all caches                      │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  1. Start React prerender                                   │
│  2. Components with 'use cache' begin async work            │
│  3. CacheSignal.beginRead() tracks each cache operation     │
│  4. Async work completes → results stored in cache          │
│  5. CacheSignal.endRead() marks completion                  │
│  6. Wait for cacheReady() (all reads complete)              │
│  7. DISCARD this render output                              │
│                                                             │
│  OUTPUT: Warm cache (results stored for Phase 2)            │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Final Render (Cache Reading)

```
┌─────────────────────────────────────────────────────────────┐
│  PURPOSE: Generate static shell with cached content         │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  1. Start React prerender with warm cache                   │
│  2. Components with 'use cache' hit cache → return INSTANT  │
│  3. No async waiting needed!                                │
│  4. Dynamic components (cookies) → postpone()               │
│  5. Capture static shell + postponed state                  │
│                                                             │
│  OUTPUT: shell.html + postponed.json                        │
└─────────────────────────────────────────────────────────────┘
```

### Code Example

```javascript
// Phase 1: Prospective Render
setRenderPhase('prospective');

const prospectivePromise = prerenderToNodeStream(<App />);

// Wait for all caches to fill
await cacheReady();  // ← This is the key!

// Abort - we don't need the output
prospectiveController.abort();

// Phase 2: Final Render
setRenderPhase('final');

const { prelude, postponed } = await prerenderToNodeStream(<App />);
// Now cached components return instantly!
```

---

## CacheSignal: Tracking Async Work

The CacheSignal is how Next.js knows when all cache operations are complete.

### The Problem

```javascript
async function Component() {
  'use cache'
  await fetch('/api/data');  // How do we know when this is done?
  return <div>...</div>;
}
```

React doesn't expose a "all async work is done" callback. We need to track it ourselves.

### The Solution: Reference Counting

```javascript
let pendingCacheReads = 0;
let resolvers = [];

function beginCacheRead() {
  pendingCacheReads++;
}

function endCacheRead() {
  pendingCacheReads--;
  if (pendingCacheReads === 0) {
    // All reads complete!
    resolvers.forEach(resolve => resolve());
  }
}

function cacheReady() {
  return new Promise(resolve => {
    resolvers.push(resolve);
    if (pendingCacheReads === 0) {
      checkAfterEventLoop();
    }
  });
}
```

### Event Loop Scheduling

A critical detail: we don't resolve immediately when count hits 0. We wait one "trip around the event loop":

```javascript
function checkAfterEventLoop() {
  setImmediate(() => {
    setTimeout(() => {
      if (pendingCacheReads === 0) {
        // Still 0 after event loop - truly done
        resolvers.forEach(resolve => resolve());
      }
      // If > 0, new work started - keep waiting
    }, 0);
  });
}
```

**Why?** React might schedule more work. By waiting for the event loop, we give React a chance to start any additional renders before we declare "done".

### Timeline Example

```
Time    Event                           pendingCacheReads
────    ─────                           ─────────────────
0ms     prerenderToNodeStream()         0
1ms     Component A starts cache read   1  ← beginRead()
2ms     Component B starts cache read   2  ← beginRead()
50ms    Component A completes           1  ← endRead()
100ms   Component B completes           0  ← endRead()
100ms   Schedule event loop check       0
101ms   setImmediate fires              0
102ms   setTimeout(0) fires             0
102ms   Still 0 → resolve cacheReady()  ✓
```

---

## Component-Level Caching

### Data-Level vs Component-Level Caching

**Data-Level Caching** (like `React.cache()` or `unstable_cache()`):
```javascript
const getData = cache(async () => {
  return await fetch('/api/data');
});

async function Component() {
  const data = await getData();  // Data is cached
  // But component STILL RE-RENDERS every time
  return <div>{processData(data)}</div>;
}
```

**Component-Level Caching** (like `'use cache'`):
```javascript
async function Component() {
  'use cache'
  const data = await fetch('/api/data');
  return <div>{processData(data)}</div>;  // ENTIRE OUTPUT is cached!
}
```

### How Component Caching Works

```javascript
function cachedComponent(name, Component) {
  return async function CachedWrapper(props) {
    const cacheKey = `component:${name}:${JSON.stringify(props)}`;

    // Check cache
    if (cache.has(cacheKey)) {
      // Return cached React elements directly!
      // No component code runs at all!
      return cache.get(cacheKey);
    }

    // Cache miss - render component
    beginCacheRead();
    try {
      const elements = await Component(props);
      cache.set(cacheKey, elements);
      return elements;
    } finally {
      endCacheRead();
    }
  };
}
```

### What Gets Cached?

React elements are plain JavaScript objects:

```javascript
// This JSX:
<div className="card">
  <h1>Title</h1>
  <p>Content</p>
</div>

// Is actually this object:
{
  type: 'div',
  props: {
    className: 'card',
    children: [
      { type: 'h1', props: { children: 'Title' } },
      { type: 'p', props: { children: 'Content' } }
    ]
  }
}
```

This entire object tree is what gets cached. On cache hit, we return this object directly - no rendering needed!

### Next.js's RSC Serialization

In Next.js, the caching uses React Server Components' Flight protocol:

```javascript
// Serialize React elements to a stream
const stream = renderToReadableStream(elements, manifest);

// Later, deserialize back to elements
const elements = await createFromReadableStream(stream);
```

This handles:
- Client component references
- Promises
- Symbols
- Circular references

Our demo simplifies this by caching the JavaScript objects directly.

---

## Dynamic APIs and Postpone

### What Makes Something "Dynamic"?

A component becomes dynamic when it accesses request-specific data:

```javascript
// These are dynamic APIs:
cookies()       // Different for each user
headers()       // Different for each request
searchParams    // Different for each URL
connection()    // Signals dynamic rendering
```

### How Postpone Works

```javascript
function cookies() {
  const store = getStore();

  if (store.type === 'prerender') {
    // At build time - we can't know the cookies!
    // "Postpone" this component for later
    React.unstable_postpone('cookies()');
    // ↑ This throws a special exception that React catches
  }

  if (store.type === 'request') {
    // At request time - return real cookies
    return parseCookies(store.request);
  }
}
```

### What Happens When postpone() is Called

```
1. Component calls cookies()

2. cookies() calls React.unstable_postpone('cookies()')

3. React catches this special "postpone" exception

4. React looks for the nearest Suspense boundary

5. React renders the fallback instead:
   <Suspense fallback={<Skeleton />}>
     <UserGreeting />  ← postponed
   </Suspense>

6. React records this as a "dynamic hole" in postponed state

7. The static shell contains the fallback + hole marker
```

### The Resulting HTML

```html
<!--$?-->
<template id="B:0"></template>
<div class="skeleton">Loading user...</div>
<!--/$-->
```

The `<!--$?-->` and `<!--/$-->` markers tell React where to inject dynamic content later.

---

## The Resume Mechanism

### What is Resume?

Resume is how React "continues" a prerender at request time:

```javascript
// At build time:
const { prelude, postponed } = await prerenderToNodeStream(<App />);
// prelude = static HTML
// postponed = state needed to continue rendering

// At request time:
resumeToPipeableStream(<App />, postponed, {
  onShellReady() {
    // Stream dynamic content
    pipe(response);
  }
});
```

### How Resume Works Internally

```
1. Load postponed state from build

2. Call resumeToPipeableStream(element, postponedState)

3. React reconstructs the component tree from postponed state
   - It knows exactly which components were postponed
   - It knows their position in the tree
   - It knows which Suspense boundaries wrap them

4. React renders ONLY the postponed components
   - Static components are NOT re-rendered
   - This is a key performance optimization

5. React generates HTML that "fills in" the holes:
   <script>
     $RC = function(b, c) {
       // Replace template with real content
     };
     $RC("B:0", "<div>Welcome, Alice!</div>");
   </script>

6. Browser executes script → content appears
```

### The Streaming Response

```html
<!-- First chunk: Static shell (sent immediately) -->
<!DOCTYPE html>
<html>
  <body>
    <header>My Store</header>
    <!--$?-->
    <template id="B:0"></template>
    <div class="skeleton">Loading...</div>
    <!--/$-->
    <footer>© 2024</footer>

<!-- Second chunk: Dynamic content (streamed later) -->
<script>
  $RC("B:0", "<div class=\"greeting\">Welcome, Alice!</div>");
</script>
  </body>
</html>
```

---

## Putting It All Together

### Complete Build Flow

```
┌─────────────────────────────────────────────────────────────┐
│  npm run build                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 1: Prospective Render                                │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  setRenderPhase('prospective')                              │
│                              │                              │
│                              ▼                              │
│  prerenderToNodeStream(<App />)                             │
│                              │                              │
│         ┌────────────────────┴────────────────────┐         │
│         │                                         │         │
│         ▼                                         ▼         │
│  ┌─────────────────┐                    ┌─────────────────┐ │
│  │ AsyncComponent  │                    │  UserGreeting   │ │
│  │  'use cache'    │                    │   cookies()     │ │
│  │                 │                    │                 │ │
│  │ beginCacheRead()│                    │   postpone()    │ │
│  │ await 1 second  │                    │   (no cache)    │ │
│  │ endCacheRead()  │                    │                 │ │
│  │                 │                    │                 │ │
│  │ Cache: MISS     │                    │                 │ │
│  │ Store result ✓  │                    │                 │ │
│  └─────────────────┘                    └─────────────────┘ │
│                              │                              │
│                              ▼                              │
│  await cacheReady()  ← Waits for pendingCacheReads === 0    │
│                              │                              │
│                              ▼                              │
│  Abort render (discard output)                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PHASE 2: Final Render                                      │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  setRenderPhase('final')                                    │
│                              │                              │
│                              ▼                              │
│  prerenderToNodeStream(<App />)                             │
│                              │                              │
│         ┌────────────────────┴────────────────────┐         │
│         │                                         │         │
│         ▼                                         ▼         │
│  ┌─────────────────┐                    ┌─────────────────┐ │
│  │ AsyncComponent  │                    │  UserGreeting   │ │
│  │                 │                    │                 │ │
│  │ Cache: HIT ⚡   │                    │   postpone()    │ │
│  │ Return instant! │                    │   → fallback    │ │
│  │ No async work!  │                    │                 │ │
│  └─────────────────┘                    └─────────────────┘ │
│                              │                              │
│                              ▼                              │
│  Abort after 100ms (static shell ready)                     │
│                              │                              │
│                              ▼                              │
│  Save: dist/shell.html + dist/postponed.json                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Complete Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│  GET / (with Cookie: user=Alice)                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Load Prerendered Assets                                 │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  shell.html     = Static HTML with holes                    │
│  postponed.json = React's internal state                    │
│  cache.json     = Cached component outputs                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Send Static Shell (Immediate!)                          │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  res.write(shellHtml)  ← User sees content FAST             │
│                                                             │
│  Browser receives:                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ <header>My Store</header>                           │    │
│  │ <div>Cached async content here</div>                │    │
│  │ <!--$?--><template id="B:0">...skeleton...<!--/$--> │    │
│  │ <footer>© 2024</footer>                             │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Resume Dynamic Content                                  │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  const store = createRequestStore(req);                     │
│  // store.request.cookies = { user: 'Alice' }               │
│                                                             │
│  resumeToPipeableStream(<App />, postponedState, {          │
│    onShellReady() {                                         │
│      pipe(res);  // Stream to response                      │
│    }                                                        │
│  });                                                        │
│                                                             │
│  React renders ONLY UserGreeting:                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ function UserGreeting() {                           │    │
│  │   const user = cookies().get('user'); // 'Alice'    │    │
│  │   return <div>Welcome, {user}!</div>;               │    │
│  │ }                                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Stream Dynamic HTML                                     │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Browser receives:                                          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ <script>                                            │    │
│  │   $RC("B:0", "<div>Welcome, Alice!</div>");         │    │
│  │ </script>                                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  $RC function replaces template with real content           │
│  User sees: "Welcome, Alice!" (skeleton disappears)         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## React APIs Used

### `prerenderToNodeStream(element, options)`

From `react-dom/static` (experimental)

```javascript
import { prerenderToNodeStream } from 'react-dom/static';

const { prelude, postponed } = await prerenderToNodeStream(
  <App />,
  {
    signal: abortController.signal,
    onError(error) {
      console.error('Render error:', error);
    }
  }
);

// prelude: ReadableStream of static HTML
// postponed: Object with state needed to resume (or null if fully static)
```

### `resumeToPipeableStream(element, postponed, options)`

From `react-dom/server`

```javascript
import { resumeToPipeableStream } from 'react-dom/server';

const { pipe } = resumeToPipeableStream(
  <App />,
  postponedState,  // From prerenderToNodeStream
  {
    onShellReady() {
      // Dynamic content is ready to stream
      pipe(response);
    },
    onAllReady() {
      // All content (including Suspense) is ready
    },
    onError(error) {
      console.error('Resume error:', error);
    }
  }
);
```

### `React.unstable_postpone(reason)`

Internal React API (requires custom build)

```javascript
// Throws a special exception that React catches
React.unstable_postpone('cookies()');

// React will:
// 1. Catch this exception
// 2. Find nearest Suspense boundary
// 3. Render fallback instead
// 4. Record this as a "dynamic hole" in postponed state
```

### Why These APIs Aren't Public

These APIs are gated behind React's `enableHalt` feature flag:

```javascript
// In React's feature flags
export const enableHalt = __EXPERIMENTAL__;
```

Only builds with `RELEASE_CHANNEL=experimental` include them. Next.js uses its own React build with these flags enabled.

---

## Summary

PPR achieves the best of both worlds through clever engineering:

1. **Two-Phase Prerendering** - First render fills caches, second render uses them instantly
2. **CacheSignal** - Tracks async work completion using reference counting
3. **Component-Level Caching** - Caches entire React element trees, not just data
4. **Postpone** - Marks components as "dynamic" without blocking the static shell
5. **Resume** - Continues rendering only the dynamic parts at request time

The result: Static-site speed with dynamic-site flexibility!
