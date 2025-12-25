# PPR From Scratch

A from-scratch implementation of **Partial Prerendering (PPR)** demonstrating how Next.js prerenders pages with async components using two-phase rendering and React's resume API.

## What is PPR?

Partial Prerendering combines **static** and **dynamic** rendering in a single page:

```
┌─────────────────────────────────────────────────────────────┐
│  STATIC SHELL (Prerendered at Build Time)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ <Header />                 ← Static                   │  │
│  │                                                       │  │
│  │ <AsyncComponent />         ← Cached (component-level) │  │
│  │                                                       │  │
│  │ ┌───────────────────────────────────────────────────┐ │  │
│  │ │ <Suspense fallback={<Skeleton />}>               │ │  │
│  │ │   <UserGreeting />       ← Dynamic (uses cookies) │ │  │
│  │ │ </Suspense>                                       │ │  │
│  │ └───────────────────────────────────────────────────┘ │  │
│  │                                                       │  │
│  │ <ProductList />            ← Static                   │  │
│  │ <Footer />                 ← Static                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Two-Phase Prerendering

This demo implements Next.js's two-phase prerendering approach:

**Phase 1: Prospective Render (Cache Filling)**
- React prerenders the component tree
- Async components with `cachedComponent()` execute their work
- Results are stored in the cache
- CacheSignal tracks when all cache reads complete

**Phase 2: Final Render (Cache Reading)**
- React prerenders again with warm caches
- Cached components return instantly (no async work)
- Static shell is captured with all cached content

### Component-Level Caching

Similar to Next.js's `'use cache'` directive, this demo caches **entire React element trees**:

```javascript
// In Next.js:
async function AsyncComponent() {
  'use cache'
  await someAsyncWork();
  return <div>Cached content</div>;
}

// In this demo:
async function AsyncComponentImpl() {
  await someAsyncWork();
  return <div>Cached content</div>;
}
export const AsyncComponent = cachedComponent('async-component', AsyncComponentImpl);
```

On cache hit, no component code runs - cached React elements are returned directly.

### Dynamic APIs & Postpone

When a component calls a dynamic API like `cookies()`:

1. **At build time**: `React.unstable_postpone()` is called
2. React captures this as a "dynamic hole" in the static shell
3. The Suspense fallback is rendered in place
4. **At request time**: `resumeToPipeableStream()` fills the hole with real data

## Project Structure

```
src/
├── cache.js              # Component-level caching with CacheSignal
├── async-storage.js      # Tracks render mode (prerender vs request)
├── dynamic-apis.js       # cookies(), headers() with postpone support
├── build.js              # Two-phase prerendering build script
├── server.js             # Request-time server with resume()
└── components/
    ├── App.js            # Root component with Suspense boundaries
    ├── AsyncComponent.js # Cached async component (1-second delay)
    ├── UserGreeting.js   # Dynamic component (uses cookies)
    └── ...               # Static components
```

## How It Works

### Build Time (`npm run build`)

```
┌──────────────────────────────────────────────────────────────┐
│  PHASE 1: Prospective Render                                 │
│  ─────────────────────────────────────────────────────────── │
│  • Start React prerender                                     │
│  • AsyncComponent executes 1-second delay                    │
│  • Result cached in memory                                   │
│  • Wait for cacheReady() (all cache reads complete)          │
│  • Abort and discard this render                             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  PHASE 2: Final Render                                       │
│  ─────────────────────────────────────────────────────────── │
│  • Start React prerender with warm cache                     │
│  • AsyncComponent returns INSTANTLY from cache               │
│  • Dynamic components (cookies) → postpone()                 │
│  • Capture static shell + postponed state                    │
│  • Save to dist/                                             │
└──────────────────────────────────────────────────────────────┘
```

### Request Time (`npm start`)

```
┌──────────────────────────────────────────────────────────────┐
│  1. Send static shell immediately                            │
│  ─────────────────────────────────────────────────────────── │
│  • User sees cached content + loading skeletons              │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  2. resumeToPipeableStream() with postponed state            │
│  ─────────────────────────────────────────────────────────── │
│  • React renders ONLY the dynamic parts                      │
│  • Static shell is NOT re-rendered                           │
│  • Stream dynamic content to fill holes                      │
└──────────────────────────────────────────────────────────────┘
```

## Setup

This demo requires a custom React build with experimental APIs (`unstable_postpone`, `prerenderToNodeStream`). These aren't available in public npm releases.

### Prerequisites

- Node.js 20+
- Git
- yarn (will be installed if missing)
- yalc (will be installed if missing)

### Installation

1. **Clone this repository:**
   ```bash
   git clone https://github.com/shakacode/react-ppr-from-scratch.git
   cd react-ppr-from-scratch
   ```

2. **Clone React and run the setup script:**
   ```bash
   # Clone React repository
   git clone https://github.com/facebook/react.git ../react

   # Run the setup script (builds React and links via yalc)
   npm run setup-react ../react
   ```

   The setup script will:
   - Checkout React v19.2.3
   - Build with experimental channel (`enableHalt=true`)
   - Publish packages via yalc
   - Link to this project

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build and run:**
   ```bash
   # Build the static shell
   npm run build

   # Start the server
   npm start

   # Visit http://localhost:3000
   ```

## Testing Dynamic Content

1. Visit http://localhost:3000 → See "Welcome, Guest!"
2. Visit http://localhost:3000/login?name=Alice → Set cookie
3. Visit http://localhost:3000 → See "Welcome, Alice!"
4. Visit http://localhost:3000/logout → Clear cookie

Watch the terminal to see:
- Cache hits/misses during build
- Resume streaming at request time

## Key Files to Study

1. **`src/cache.js`** - CacheSignal implementation, component-level caching
2. **`src/build.js`** - Two-phase prerendering (prospective + final)
3. **`src/server.js`** - Request-time resume with `resumeToPipeableStream()`
4. **`src/dynamic-apis.js`** - How `cookies()` triggers postpone
5. **`src/components/AsyncComponent.js`** - Cached async component example

## How This Compares to Next.js

| Feature | This Demo | Next.js |
|---------|-----------|---------|
| Cache Key Generation | Manual string keys | Compiler-generated from file + function name |
| Cache Directive | `cachedComponent()` wrapper | `'use cache'` directive |
| RSC Serialization | Simple JSON | Flight protocol |
| Two-Phase Render | Yes | Yes |
| CacheSignal | Simplified | Full implementation |
| Resume API | `resumeToPipeableStream()` | `resumeToPipeableStream()` |

## Why Custom React Build?

Next.js uses internal React APIs that aren't publicly exported:

- **`React.unstable_postpone()`** - Creates "dynamic holes" in static shell
- **`prerenderToNodeStream()`** - Returns `postponed` state object
- **`resumeToPipeableStream()`** - Continues from postponed state

These require building React with `enableHalt=true` in the feature flags.

## License

MIT
