import { test, expect, mock, beforeEach, afterEach } from "bun:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("browser fetch delegates to globalThis.fetch", async () => {
  const mockFn = mock(async () => new Response("ok", { status: 200 }));
  globalThis.fetch = mockFn as typeof globalThis.fetch;

  // Re-import to pick up mocked globalThis.fetch
  const { fetch } = await import("./browser");
  const res = await fetch("http://example.com");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
  expect(mockFn).toHaveBeenCalled();
});

test("browser fetch passes init options through", async () => {
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (_input: any, init?: RequestInit) => {
    capturedInit = init;
    return new Response(null, { status: 200 });
  };

  const { fetch } = await import("./browser");
  await fetch("http://example.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: true }),
  });
  expect(capturedInit?.method).toBe("POST");
  expect((capturedInit?.headers as any)["Content-Type"]).toBe("application/json");
});

test("browser fetch retries on failure", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls < 3) return new Response(null, { status: 503 });
    return new Response(null, { status: 200 });
  };

  const { fetch } = await import("./browser");
  const res = await fetch("http://example.com", { retries: 3, retryDelay: 1 });
  expect(res.status).toBe(200);
  expect(calls).toBe(3);
});
