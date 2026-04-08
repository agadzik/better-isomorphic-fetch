import { test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import type { Server } from "bun";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { context, propagation, trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { fetch } from "./node";

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

// Local test server for Server-Timing tests
let server: Server;
const serverUrl = (path: string) => `http://localhost:${server.port}${path}`;

server = Bun.serve({
  port: 0,
  routes: {
    "/server-timing": new Response("ok", {
      headers: {
        "Server-Timing": 'cache;dur=2.5;desc="Cache Read", db;dur=53.2;desc="Database Query", app;dur=120',
      },
    }),
    "/server-timing-no-dur": new Response("ok", {
      headers: { "Server-Timing": "miss" },
    }),
    "/no-server-timing": new Response("ok"),
  },
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
});

afterEach(async () => {
  await provider.shutdown();
  trace.disable();
});

test("creates a span for a successful fetch", async () => {
  const response = await fetch("https://httpbin.org/status/200");
  expect(response.status).toBe(200);

  const spans = exporter.getFinishedSpans();
  expect(spans.length).toBe(1);

  const span = spans[0];
  expect(span.name).toBe("HTTP GET");
  expect(span.kind).toBe(SpanKind.CLIENT);
  expect(span.attributes["http.request.method"]).toBe("GET");
  expect(span.attributes["url.full"]).toBe("https://httpbin.org/status/200");
  expect(span.attributes["server.address"]).toBe("httpbin.org");
  expect(span.attributes["server.port"]).toBe(443);
  expect(span.attributes["http.response.status_code"]).toBe(200);
});

test("sets span status to ERROR on 500", async () => {
  const response = await fetch("https://httpbin.org/status/500");
  expect(response.status).toBe(500);

  const spans = exporter.getFinishedSpans();
  expect(spans.length).toBe(1);
  expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
  expect(spans[0].status.message).toBe("HTTP 500");
});

test("records retry events and resend_count", async () => {
  const response = await fetch("https://httpbin.org/status/503", {
    retries: 2,
    retryDelay: 100,
  });
  expect(response.status).toBe(503);

  const spans = exporter.getFinishedSpans();
  expect(spans.length).toBe(1);

  const span = spans[0];
  expect(span.attributes["http.resend_count"]).toBe(2);

  const retryEvents = span.events.filter((e) => e.name === "http.retry");
  expect(retryEvents.length).toBe(2);
  expect(retryEvents[0].attributes?.attempt).toBe(1);
  expect(retryEvents[1].attributes?.attempt).toBe(2);
  expect(retryEvents[0].attributes?.status_code).toBe(503);
});

test("injects traceparent header", async () => {
  const response = await fetch("https://httpbin.org/headers");
  const data = await response.json();
  // httpbin normalizes header names to title-case; undici may send lowercase
  const traceparent =
    data.headers["Traceparent"] ?? data.headers["traceparent"];
  expect(traceparent).toBeDefined();
  expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
});

test("preserves user-provided onRetry callback", async () => {
  const retryAttempts: number[] = [];

  const response = await fetch("https://httpbin.org/status/503", {
    retries: 1,
    retryDelay: 100,
    onRetry: ({ attempt }) => {
      retryAttempts.push(attempt);
    },
  });

  expect(retryAttempts).toEqual([1]);

  const spans = exporter.getFinishedSpans();
  const retryEvents = spans[0].events.filter((e) => e.name === "http.retry");
  expect(retryEvents.length).toBe(1);
});

test("records exception on network error", async () => {
  try {
    await fetch("https://localhost:1/nonexistent", {
      retries: 0,
    });
  } catch {
    // expected
  }

  const spans = exporter.getFinishedSpans();
  expect(spans.length).toBe(1);
  expect(spans[0].status.code).toBe(SpanStatusCode.ERROR);
  expect(spans[0].events.some((e) => e.name === "exception")).toBe(true);
});

test("uses correct method in span name for POST", async () => {
  const response = await fetch("https://httpbin.org/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: true }),
  });
  expect(response.status).toBe(200);

  const spans = exporter.getFinishedSpans();
  expect(spans[0].name).toBe("HTTP POST");
  expect(spans[0].attributes["http.request.method"]).toBe("POST");
});

test("parses Server-Timing header into span attributes", async () => {
  const response = await fetch(serverUrl("/server-timing"));
  expect(response.status).toBe(200);

  const spans = exporter.getFinishedSpans();
  expect(spans.length).toBe(1);
  const attrs = spans[0].attributes;

  expect(attrs["http.server_timing.cache.duration"]).toBe(2.5);
  expect(attrs["http.server_timing.cache.description"]).toBe("Cache Read");
  expect(attrs["http.server_timing.db.duration"]).toBe(53.2);
  expect(attrs["http.server_timing.db.description"]).toBe("Database Query");
  expect(attrs["http.server_timing.app.duration"]).toBe(120);
  expect(attrs["http.server_timing.app.description"]).toBeUndefined();
});

test("handles Server-Timing entry with no dur", async () => {
  const response = await fetch(serverUrl("/server-timing-no-dur"));
  expect(response.status).toBe(200);

  const spans = exporter.getFinishedSpans();
  const attrs = spans[0].attributes;

  expect(attrs["http.server_timing.miss.duration"]).toBeUndefined();
  expect(attrs["http.server_timing.miss.description"]).toBeUndefined();
});

test("no server-timing attributes when header is absent", async () => {
  const response = await fetch(serverUrl("/no-server-timing"));
  expect(response.status).toBe(200);

  const spans = exporter.getFinishedSpans();
  const attrKeys = Object.keys(spans[0].attributes);
  expect(attrKeys.some((k) => k.startsWith("http.server_timing."))).toBe(
    false,
  );
});
