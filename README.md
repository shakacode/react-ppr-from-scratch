# PPR From Scratch

A simplified implementation of **Partial Prerendering (PPR)** to demonstrate how Next.js implements this feature.

## What is PPR?

Partial Prerendering combines **static** and **dynamic** rendering in a single page:

```
┌─────────────────────────────────────────────────────────────┐
│  STATIC SHELL (Prerendered at Build Time)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ <Header />                 ← Static (same for all)    │  │
│  │                                                       │  │
│  │ ┌───────────────────────────────────────────────────┐ │  │
│  │ │ <Suspense fallback={<Loading />}>                 │ │  │
│  │ │   <UserGreeting />       ← Dynamic (uses cookies) │ │  │
│  │ │ </Suspense>                                       │ │  │
│  │ └───────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  │ <ProductList />            ← Static (same for all)    │  │
│  │ <Footer />                 ← Static (same for all)    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## How It Works

### Build Time
1. React renders the component tree
2. When a component calls `cookies()`, it **suspends**
3. The Suspense fallback is rendered in place of the dynamic content
4. The result is saved as the "static shell"

### Request Time
1. User requests the page
2. Server renders with real request data (cookies, headers, etc.)
3. Dynamic components now get real values
4. Full page is streamed to the client

## Project Structure

```
src/
├── async-storage.js      # Tracks render mode (prerender vs request)
├── dynamic-apis.js       # cookies(), headers() implementations
├── build.js              # Build-time prerender script
├── server.js             # Request-time server with streaming
└── components/
    ├── App.js            # Root component with Suspense boundary
    ├── Header.js         # Static component
    ├── Footer.js         # Static component
    ├── ProductList.js    # Static component
    └── UserGreeting.js   # Dynamic component (uses cookies)
```

## Key Concepts

### 1. The Prerender Store (`async-storage.js`)

```javascript
// During BUILD: Track dynamic API usage
const prerenderStore = {
  type: 'prerender',
  dynamicAccesses: [],  // Track which APIs were called
};

// During REQUEST: Provide real request data
const requestStore = {
  type: 'request',
  request: req,  // The actual HTTP request
};
```

### 2. Dynamic APIs (`dynamic-apis.js`)

```javascript
async function cookies() {
  const store = getStore();

  if (store.type === 'prerender') {
    // Can't access cookies at build time!
    // Suspend this component to show fallback
    trackDynamicAccess('cookies()');
    throw NEVER_RESOLVES;  // Suspends forever
  }

  if (store.type === 'request') {
    // Real request - return actual cookies
    return parseCookies(store.request);
  }
}
```

### 3. Suspense Boundary (`components/App.js`)

```javascript
// The Suspense boundary is CRITICAL for PPR
<Suspense fallback={<UserGreetingFallback />}>
  <UserGreeting />  {/* This calls cookies() */}
</Suspense>
```

Without Suspense, the entire page would be dynamic!

### 4. Build Process (`build.js`)

```javascript
// Use React's streaming SSR
const { pipe, abort } = renderToPipeableStream(<App />);

// When shell is ready (static content + fallbacks)
onShellReady() {
  pipe(outputStream);

  // Don't wait for suspended components
  setTimeout(() => abort(), 100);
}
```

### 5. Request Handling (`server.js`)

```javascript
// Create store with real request
const requestStore = createRequestStore(req);

// Render with streaming
renderStorage.run(requestStore, () => {
  const { pipe } = renderToPipeableStream(<App />);

  onShellReady() {
    pipe(res);  // Stream to response
  }
});
```

## Running the Demo

```bash
# Install dependencies
npm install

# Build the static shell
npm run build

# Start the server
npm start

# Visit http://localhost:3000
```

## Testing Dynamic Content

1. Visit http://localhost:3000 → See "Welcome back, Guest!"
2. Visit http://localhost:3000/login?name=Alice → Set cookie
3. Visit http://localhost:3000 → See "Welcome back, Alice!"
4. Visit http://localhost:3000/logout → Clear cookie

## How This Differs from Next.js

| Feature | This Demo | Next.js |
|---------|-----------|---------|
| React Version | Public React 19 | Custom canary build |
| Postpone API | Simulated via suspension | `React.unstable_postpone()` |
| Resume API | Fresh render | `react-dom/server.resume()` |
| Caching | None | Resume data cache |
| Streaming | Basic | Advanced with transforms |

Next.js uses internal React APIs that aren't public:
- `React.unstable_postpone()` - Creates true "dynamic holes"
- `react-dom/static.prerender()` - Returns a `postponed` object
- `react-dom/server.resume()` - Continues from postponed state

This demo achieves similar results using public APIs by:
- Using Suspense + suspension for dynamic holes
- Doing fresh renders at request time

## Key Takeaways

1. **Static vs Dynamic** - A component becomes dynamic when it accesses request-specific data
2. **Suspense is the boundary** - Wrap dynamic components in Suspense to isolate them
3. **Streaming is key** - React's streaming SSR enables progressive loading
4. **Build-time detection** - Track dynamic API usage to know which components are dynamic

## Files to Study

Start with these files in order:
1. `src/async-storage.js` - Understand the render context
2. `src/dynamic-apis.js` - See how dynamic APIs trigger suspension
3. `src/components/UserGreeting.js` - A dynamic component
4. `src/build.js` - The build-time prerender
5. `src/server.js` - Request-time rendering

Each file is extensively commented to explain the concepts!
