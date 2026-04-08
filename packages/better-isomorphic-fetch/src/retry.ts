export interface BetterFetchInit extends RequestInit {
  /** Number of retry attempts. Default: 0 (no retries). */
  retries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000. */
  retryDelay?: number;
  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504]. */
  retryOn?: number[];
  /** HTTP methods eligible for retry. Default: ["GET", "HEAD", "OPTIONS", "PUT"]. */
  retryMethods?: string[];
  /** Called before each retry. Return false to abort retries. */
  onRetry?: (info: {
    attempt: number;
    error: Error | null;
    response: Response | null;
    delay: number;
  }) => boolean | void | Promise<boolean | void>;
}

const DEFAULT_RETRY_ON = [408, 429, 500, 502, 503, 504];
const DEFAULT_RETRY_METHODS = ["GET", "HEAD", "OPTIONS", "PUT"];

export function stripRetryFields(init?: BetterFetchInit): RequestInit | undefined {
  if (!init) return init;
  const { retries, retryDelay, retryOn, retryMethods, onRetry, ...rest } = init;
  return rest;
}

function parseRetryAfter(header: string | null): number | null {
  if (header == null) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMethod(input: Request | string | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

export async function withRetry(
  doFetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response>,
  input: Request | string | URL,
  init?: BetterFetchInit,
): Promise<Response> {
  const retries = init?.retries ?? 0;

  if (retries <= 0) return doFetch(input, init);

  const cleanInit = stripRetryFields(init);
  const retryDelay = init?.retryDelay ?? 1000;
  const retryOn = init?.retryOn ?? DEFAULT_RETRY_ON;
  const retryMethods = (init?.retryMethods ?? DEFAULT_RETRY_METHODS).map(m => m.toUpperCase());
  const onRetry = init?.onRetry;
  const signal = init?.signal;

  const method = resolveMethod(input, cleanInit);
  if (!retryMethods.includes(method)) return doFetch(input, cleanInit);

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && signal?.aborted) {
      throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }

    try {
      lastResponse = await doFetch(input, cleanInit);
      lastError = null;

      if (!retryOn.includes(lastResponse.status) || attempt === retries) {
        return lastResponse;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      lastResponse = null;

      if (attempt === retries) throw lastError;
    }

    // Cancel previous response body to free the connection
    lastResponse?.body?.cancel();

    let delay = retryDelay * Math.pow(2, attempt) + Math.random() * retryDelay * 0.2;

    // Respect Retry-After header for 429
    if (lastResponse?.status === 429) {
      const retryAfter = parseRetryAfter(lastResponse.headers.get("Retry-After"));
      if (retryAfter != null) {
        const maxBackoff = retryDelay * Math.pow(2, retries);
        delay = Math.min(Math.max(delay, retryAfter), maxBackoff);
      }
    }

    if (onRetry) {
      const result = await onRetry({
        attempt: attempt + 1,
        error: lastError,
        response: lastResponse,
        delay,
      });
      if (result === false) {
        if (lastError) throw lastError;
        return lastResponse!;
      }
    }

    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }

    await sleep(delay);
  }

  // Unreachable: the final iteration always returns or throws above
  throw lastError ?? new Error("Retry loop exited unexpectedly");
}
