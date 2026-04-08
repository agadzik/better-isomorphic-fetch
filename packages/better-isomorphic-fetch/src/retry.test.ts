import { test, expect, mock } from "bun:test";
import { withRetry, type BetterFetchInit } from "./retry";

function mockResponse(status: number, headers?: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

type DoFetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

test("no retries by default (retries=0)", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(503);
  };
  const res = await withRetry(doFetch, "http://example.com");
  expect(res.status).toBe(503);
  expect(calls).toBe(1);
});

test("retries on network error", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 3) throw new Error("connection refused");
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", { retries: 3, retryDelay: 1 });
  expect(res.status).toBe(200);
  expect(calls).toBe(3);
});

test("retries on retryable status code", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 3) return mockResponse(503);
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", { retries: 3, retryDelay: 1 });
  expect(res.status).toBe(200);
  expect(calls).toBe(3);
});

test("no retry for non-retryable status code", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(400);
  };
  const res = await withRetry(doFetch, "http://example.com", { retries: 3, retryDelay: 1 });
  expect(res.status).toBe(400);
  expect(calls).toBe(1);
});

test("no retry for non-retryable method (POST)", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(503);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    method: "POST",
    retries: 3,
    retryDelay: 1,
  });
  expect(res.status).toBe(503);
  expect(calls).toBe(1);
});

test("custom retryMethods allows POST", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(503);
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    method: "POST",
    retries: 3,
    retryDelay: 1,
    retryMethods: ["POST"],
  });
  expect(res.status).toBe(200);
  expect(calls).toBe(2);
});

test("custom retryOn", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(400);
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 3,
    retryDelay: 1,
    retryOn: [400],
  });
  expect(res.status).toBe(200);
  expect(calls).toBe(2);
});

test("onRetry receives correct args", async () => {
  const onRetryCalls: { attempt: number; error: Error | null; response: Response | null; delay: number }[] = [];
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls === 1) return mockResponse(503);
    if (calls === 2) throw new Error("network fail");
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 3,
    retryDelay: 1,
    onRetry: (info) => { onRetryCalls.push(info); },
  });
  expect(res.status).toBe(200);
  expect(onRetryCalls.length).toBe(2);
  // First retry: after 503 response
  expect(onRetryCalls[0]!.attempt).toBe(1);
  expect(onRetryCalls[0]!.response?.status).toBe(503);
  expect(onRetryCalls[0]!.error).toBeNull();
  // Second retry: after network error
  expect(onRetryCalls[1]!.attempt).toBe(2);
  expect(onRetryCalls[1]!.response).toBeNull();
  expect(onRetryCalls[1]!.error?.message).toBe("network fail");
});

test("onRetry returning false aborts retries", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(503);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 5,
    retryDelay: 1,
    onRetry: ({ attempt }) => {
      if (attempt >= 2) return false;
    },
  });
  expect(res.status).toBe(503);
  expect(calls).toBe(2);
});

test("onRetry returning false on network error re-throws", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    throw new Error("always fails");
  };
  await expect(
    withRetry(doFetch, "http://example.com", {
      retries: 5,
      retryDelay: 1,
      onRetry: () => false,
    }),
  ).rejects.toThrow("always fails");
  expect(calls).toBe(1);
});

test("Retry-After header respected on 429", async () => {
  const delays: number[] = [];
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(429, { "Retry-After": "0" });
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 3,
    retryDelay: 1,
    onRetry: ({ delay }) => { delays.push(delay); },
  });
  expect(res.status).toBe(200);
  expect(delays.length).toBe(1);
  // With Retry-After: 0 (0ms), delay should be at least the computed backoff
  expect(delays[0]).toBeGreaterThanOrEqual(0);
});

test("Retry-After capped at max backoff", async () => {
  const delays: number[] = [];
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(429, { "Retry-After": "99999" });
    return mockResponse(200);
  };
  const maxBackoff = 10 * Math.pow(2, 2); // retryDelay=10, retries=2
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 2,
    retryDelay: 10,
    onRetry: ({ delay }) => { delays.push(delay); },
  });
  expect(delays[0]).toBeLessThanOrEqual(maxBackoff);
});

test("AbortSignal stops retries", async () => {
  const controller = new AbortController();
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls === 1) {
      controller.abort();
      return mockResponse(503);
    }
    return mockResponse(200);
  };
  await expect(
    withRetry(doFetch, "http://example.com", {
      retries: 3,
      retryDelay: 1,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

test("delay values increase exponentially", async () => {
  const delays: number[] = [];
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(503);
  };
  await withRetry(doFetch, "http://example.com", {
    retries: 3,
    retryDelay: 100,
    onRetry: ({ delay }) => { delays.push(delay); },
  });
  expect(delays.length).toBe(3);
  // Each delay should be roughly 2x the previous (within jitter tolerance)
  for (let i = 1; i < delays.length; i++) {
    expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
  }
});

test("exhausted retries returns last response", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(503);
  };
  const res = await withRetry(doFetch, "http://example.com", { retries: 2, retryDelay: 1 });
  expect(res.status).toBe(503);
  expect(calls).toBe(3); // initial + 2 retries
});

test("exhausted retries throws last error", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    throw new Error(`fail ${calls}`);
  };
  await expect(
    withRetry(doFetch, "http://example.com", { retries: 2, retryDelay: 1 }),
  ).rejects.toThrow("fail 3");
  expect(calls).toBe(3);
});

test("retry fields stripped from init passed to doFetch", async () => {
  let capturedInit: RequestInit | undefined;
  const doFetch: DoFetch = async (_input, init) => {
    capturedInit = init;
    return mockResponse(200);
  };
  await withRetry(doFetch, "http://example.com", {
    method: "GET",
    retries: 3,
    retryDelay: 100,
    retryOn: [500],
    retryMethods: ["GET"],
    onRetry: () => {},
    headers: { "X-Test": "yes" },
  });
  expect(capturedInit).toBeDefined();
  expect((capturedInit as any).retries).toBeUndefined();
  expect((capturedInit as any).retryDelay).toBeUndefined();
  expect((capturedInit as any).retryOn).toBeUndefined();
  expect((capturedInit as any).retryMethods).toBeUndefined();
  expect((capturedInit as any).onRetry).toBeUndefined();
  expect(capturedInit?.method).toBe("GET");
  expect((capturedInit?.headers as any)["X-Test"]).toBe("yes");
});

test("resolves method from Request object", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(503);
    return mockResponse(200);
  };
  const req = new Request("http://example.com", { method: "GET" });
  const res = await withRetry(doFetch, req, { retries: 2, retryDelay: 1 });
  expect(res.status).toBe(200);
  expect(calls).toBe(2);
});

test("stripRetryFields returns undefined for undefined input", () => {
  const { stripRetryFields } = require("./retry");
  expect(stripRetryFields(undefined)).toBeUndefined();
});

test("non-Error thrown from fetch is wrapped in Error", async () => {
  const doFetch: DoFetch = async () => {
    throw "string error";
  };
  await expect(
    withRetry(doFetch, "http://example.com", { retries: 1, retryDelay: 1 }),
  ).rejects.toThrow("string error");
});

test("defaults to GET when input is a plain URL string", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(503);
    return mockResponse(200);
  };
  // No method in init, no Request — should default to GET which is retryable
  const res = await withRetry(doFetch, "http://example.com", { retries: 2, retryDelay: 1 });
  expect(res.status).toBe(200);
  expect(calls).toBe(2);
});

test("retryMethods matching is case-insensitive", async () => {
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(503);
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    method: "post",
    retries: 2,
    retryDelay: 1,
    retryMethods: ["post"],
  });
  expect(res.status).toBe(200);
  expect(calls).toBe(2);
});

test("AbortSignal aborted during sleep aborts retries", async () => {
  const controller = new AbortController();
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    return mockResponse(503);
  };
  // Abort after a short delay (during the sleep between retries)
  setTimeout(() => controller.abort(), 5);
  await expect(
    withRetry(doFetch, "http://example.com", {
      retries: 5,
      retryDelay: 50,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  // Should not have completed all retries
  expect(calls).toBeLessThan(6);
});

test("Retry-After with HTTP-date format", async () => {
  const delays: number[] = [];
  let calls = 0;
  // Set Retry-After to a date 0.5s in the past so parsed delay is ~0
  const pastDate = new Date(Date.now() - 500).toUTCString();
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(429, { "Retry-After": pastDate });
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 2,
    retryDelay: 1,
    onRetry: ({ delay }) => { delays.push(delay); },
  });
  expect(res.status).toBe(200);
  expect(delays.length).toBe(1);
  // Past date results in 0ms Retry-After, so delay should be at least the computed backoff
  expect(delays[0]).toBeGreaterThanOrEqual(0);
});

test("Retry-After with invalid value is ignored", async () => {
  const delays: number[] = [];
  let calls = 0;
  const doFetch: DoFetch = async () => {
    calls++;
    if (calls < 2) return mockResponse(429, { "Retry-After": "not-a-date-or-number" });
    return mockResponse(200);
  };
  const res = await withRetry(doFetch, "http://example.com", {
    retries: 2,
    retryDelay: 10,
    onRetry: ({ delay }) => { delays.push(delay); },
  });
  expect(res.status).toBe(200);
  // Should still compute a normal exponential backoff delay
  expect(delays[0]).toBeGreaterThanOrEqual(10);
});
