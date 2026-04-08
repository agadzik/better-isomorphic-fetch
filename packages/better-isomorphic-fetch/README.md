# better-isomorphic-fetch

A drop-in `fetch` replacement with **retries**, **exponential backoff**, and **OpenTelemetry tracing** — zero config required.

- Same `fetch(url, init)` signature you already know
- Exponential backoff with jitter, `Retry-After` support, abort signal awareness
- Safe defaults: only idempotent methods are retried, only transient status codes trigger retries
- Automatic [OpenTelemetry](https://opentelemetry.io/) spans, trace propagation, and `Server-Timing` parsing on Node.js (opt-in)
- Uses [undici](https://github.com/nodejs/undici) `request` on Node.js, native `fetch` in the browser

## Install

```bash
pnpm add better-isomorphic-fetch
```

`@opentelemetry/api` is an optional peer dependency — install it to enable automatic tracing on Node.js.

```bash
pnpm add @opentelemetry/api
```

## Quick start

```ts
import { fetch } from "better-isomorphic-fetch";

const response = await fetch("https://api.example.com/data", {
  retries: 3,
  retryDelay: 500,
});
```

That's it. If the request fails with a `503`, it retries up to 3 times with exponential backoff starting at 500ms. Everything else works exactly like `fetch`.

## Options

`better-isomorphic-fetch` extends the standard `RequestInit` with retry configuration:

```ts
interface BetterFetchInit extends RequestInit {
  retries?: number;
  retryDelay?: number;
  retryOn?: number[];
  retryMethods?: string[];
  onRetry?: (info: {
    attempt: number;
    error: Error | null;
    response: Response | null;
    delay: number;
  }) => boolean | void | Promise<boolean | void>;
}
```

| Option | Default | Description |
|---|---|---|
| `retries` | `0` | Number of retry attempts. `0` means no retries (standard fetch behavior). |
| `retryDelay` | `1000` | Base delay in milliseconds. Actual delay uses exponential backoff with jitter: `delay * 2^attempt + random jitter`. |
| `retryOn` | `[408, 429, 500, 502, 503, 504]` | HTTP status codes that trigger a retry. |
| `retryMethods` | `["GET", "HEAD", "OPTIONS", "PUT"]` | HTTP methods eligible for retry. POST is excluded by default to prevent duplicate side effects. |
| `onRetry` | — | Hook called before each retry. Return `false` to abort. |

## Examples

### Basic retry

```ts
import { fetch } from "better-isomorphic-fetch";

const res = await fetch("https://api.example.com/users", {
  retries: 3,
});
```

### Custom retry behavior

```ts
const res = await fetch("https://api.example.com/webhook", {
  method: "POST",
  body: JSON.stringify({ event: "deploy" }),
  retries: 5,
  retryDelay: 200,
  retryMethods: ["POST"],       // opt POST into retries
  retryOn: [429, 502, 503],     // only retry on these codes
});
```

### Logging retries

```ts
const res = await fetch("https://api.example.com/data", {
  retries: 3,
  retryDelay: 1000,
  onRetry: ({ attempt, error, response, delay }) => {
    console.log(
      `Retry ${attempt} in ${delay}ms`,
      response ? `status=${response.status}` : error?.message,
    );
  },
});
```

### Aborting retries early

Return `false` from `onRetry` to stop retrying immediately:

```ts
const res = await fetch("https://api.example.com/data", {
  retries: 10,
  onRetry: ({ attempt, response }) => {
    if (response?.status === 401) return false; // don't retry auth errors
  },
});
```

### With AbortSignal

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const res = await fetch("https://api.example.com/slow", {
  retries: 3,
  signal: controller.signal,
});
```

The signal is checked between retries — if aborted during the backoff sleep, the fetch throws immediately.

## Retry behavior

**Exponential backoff with jitter.** Delay doubles each attempt with 20% random jitter to prevent thundering herd:

```
Attempt 1: retryDelay * 2^0 + jitter  →  ~1000ms
Attempt 2: retryDelay * 2^1 + jitter  →  ~2000ms
Attempt 3: retryDelay * 2^2 + jitter  →  ~4000ms
```

**`Retry-After` header.** On 429 responses, the `Retry-After` header is respected (both seconds and HTTP-date formats). The delay is clamped to the max backoff to prevent unbounded waits.

**Connection cleanup.** Response bodies are cancelled between retries to free connections.

**Method safety.** Only idempotent methods are retried by default. Override with `retryMethods` when you know it's safe.

## OpenTelemetry (Node.js)

When `@opentelemetry/api` is installed and a tracer provider is configured, every fetch automatically produces a client span:

```
HTTP GET
├─ http.request.method: GET
├─ url.full: https://api.example.com/data
├─ server.address: api.example.com
├─ server.port: 443
├─ http.response.status_code: 200
├─ http.resend_count: 2              ← only if retries occurred
├─ http.server_timing.cache.duration: 2.5
├─ http.server_timing.db.duration: 53.2
└─ events:
   ├─ http.retry { attempt: 1, status_code: 503, delay_ms: 1020 }
   └─ http.retry { attempt: 2, status_code: 503, delay_ms: 2180 }
```

Features:

- **Client spans** with [semantic HTTP attributes](https://opentelemetry.io/docs/specs/semconv/http/http-spans/)
- **W3C Trace Context** propagation on outgoing headers
- **`http.retry` events** with attempt number, delay, status code, and error
- **`http.resend_count`** attribute when retries occurred
- **`Server-Timing` header** parsed into `http.server_timing.<name>.duration` and `http.server_timing.<name>.description` attributes
- **Error recording** — 5xx responses set span status to ERROR; exceptions are recorded

No OpenTelemetry? No problem — the library works identically without it. The import is lazy and failure is silent.

## Browser vs Node.js

The package uses [conditional exports](https://nodejs.org/api/packages.html#conditional-exports):

| Environment | Implementation | OTel |
|---|---|---|
| **Node.js** | [undici](https://github.com/nodejs/undici) `request()` | Yes (when `@opentelemetry/api` is installed) |
| **Browser** | `globalThis.fetch` | No |

Both environments get the same retry behavior. The split is handled automatically by your bundler or runtime.

## License

MIT
