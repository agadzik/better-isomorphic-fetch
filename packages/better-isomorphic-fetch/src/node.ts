import { request } from "undici";
import { withRetry, type BetterFetchInit } from "./retry";

type OtelApi = typeof import("@opentelemetry/api");

let _otelApi: OtelApi | null | undefined;
async function getOtelApi(): Promise<OtelApi | null> {
  if (_otelApi === undefined) {
    try {
      _otelApi = await import("@opentelemetry/api");
    } catch {
      _otelApi = null;
    }
  }
  return _otelApi;
}

function resolveUrl(input: RequestInfo | URL, init?: RequestInit): string {
  if (input instanceof Request) return input.url;
  return input.toString();
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

interface ServerTimingEntry {
  name: string;
  dur?: number;
  desc?: string;
}

function parseServerTiming(header: string): ServerTimingEntry[] {
  const entries: ServerTimingEntry[] = [];
  for (const part of header.split(",")) {
    const params = part.trim().split(";").map((s) => s.trim());
    const name = params[0];
    if (!name) continue;
    const entry: ServerTimingEntry = { name };
    for (let i = 1; i < params.length; i++) {
      const [key, ...rest] = params[i].split("=");
      const value = rest.join("=");
      if (key === "dur") {
        const n = Number(value);
        if (!Number.isNaN(n)) entry.dur = n;
      } else if (key === "desc") {
        entry.desc = value.replace(/^"|"$/g, "");
      }
    }
    entries.push(entry);
  }
  return entries;
}

function toHeaderRecord(headers: HeadersInit): Record<string, string> {
  const record: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      record[key] = value;
    }
  } else {
    return headers as Record<string, string>;
  }
  return record;
}

async function doFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let url: string;
  let method: string | undefined;
  let headers: HeadersInit | undefined;
  let body: BodyInit | null | undefined;

  if (input instanceof Request) {
    url = input.url;
    method = init?.method ?? input.method;
    headers = init?.headers ?? input.headers;
    body = init?.body ?? input.body;
  } else {
    url = input.toString();
    method = init?.method;
    headers = init?.headers;
    body = init?.body;
  }

  let headerRecord: Record<string, string> | undefined;
  if (headers) {
    headerRecord = toHeaderRecord(headers);
  }

  const response = await request(url, {
    method: method as import("undici").Dispatcher.HttpMethod,
    headers: headerRecord,
    body: body as import("undici").Dispatcher.DispatchOptions["body"],
  });

  return new Response(response.body as unknown as ReadableStream, {
    status: response.statusCode,
    headers: response.headers as HeadersInit,
  });
}

export async function fetch(
  input: RequestInfo | URL,
  init?: BetterFetchInit,
): Promise<Response> {
  const otel = await getOtelApi();
  if (!otel) {
    return withRetry(doFetch, input, init);
  }

  const { SpanKind, SpanStatusCode, context, propagation, trace } = otel;
  const tracer = trace.getTracer("better-isomorphic-fetch", "0.0.1");

  const url = resolveUrl(input, init);
  const method = resolveMethod(input, init);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return withRetry(doFetch, input, init);
  }

  const span = tracer.startSpan(`HTTP ${method}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      "http.request.method": method,
      "url.full": url,
      "server.address": parsedUrl.hostname,
      "server.port": parsedUrl.port
        ? Number(parsedUrl.port)
        : parsedUrl.protocol === "https:"
          ? 443
          : 80,
    },
  });

  // Inject trace context into outgoing headers
  const ctx = trace.setSpan(context.active(), span);
  const carrier: Record<string, string> = {};
  propagation.inject(ctx, carrier);
  const rawHeaders =
    init?.headers ??
    (input instanceof Request ? input.headers : undefined);
  const existingHeaders = rawHeaders ? toHeaderRecord(rawHeaders) : {};
  const mergedInit: BetterFetchInit = {
    ...init,
    headers: {
      ...existingHeaders,
      ...carrier
    },
  };

  // Wrap onRetry to record span events
  let retryCount = 0;
  const userOnRetry = init?.onRetry;
  mergedInit.onRetry = async (info) => {
    retryCount = info.attempt;
    span.addEvent("http.retry", {
      attempt: info.attempt,
      delay_ms: info.delay,
      ...(info.response ? { status_code: info.response.status } : {}),
      ...(info.error ? { error: info.error.message } : {}),
    });
    if (userOnRetry) return userOnRetry(info);
  };

  try {
    const response = await withRetry(doFetch, input, mergedInit);
    span.setAttribute("http.response.status_code", response.status);
    if (retryCount > 0) {
      span.setAttribute("http.resend_count", retryCount);
    }

    // Parse Server-Timing header into span attributes
    const serverTiming = response.headers.get("server-timing");
    if (serverTiming) {
      const entries = parseServerTiming(serverTiming);
      for (const entry of entries) {
        if (entry.dur !== undefined) {
          span.setAttribute(
            `http.server_timing.${entry.name}.duration`,
            entry.dur,
          );
        }
        if (entry.desc) {
          span.setAttribute(
            `http.server_timing.${entry.name}.description`,
            entry.desc,
          );
        }
      }
    }

    if (response.status >= 500) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${response.status}`,
      });
    }
    return response;
  } catch (error) {
    if (retryCount > 0) {
      span.setAttribute("http.resend_count", retryCount);
    }
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  } finally {
    span.end();
  }
}
