import { test, expect } from "bun:test";
import { fetch } from "./node";

test("fetch returns a Response with correct status", async () => {
  const response = await fetch("https://httpbin.org/status/200");
  expect(response).toBeInstanceOf(Response);
  expect(response.status).toBe(200);
});

test("fetch supports JSON responses", async () => {
  const response = await fetch("https://httpbin.org/json");
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toBeDefined();
});

test("fetch supports POST with body", async () => {
  const response = await fetch("https://httpbin.org/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
  });
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.json).toEqual({ hello: "world" });
});

test("fetch supports Request object input", async () => {
  const request = new Request("https://httpbin.org/get", {
    headers: { "X-Test": "hello" },
  });
  const response = await fetch(request);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.headers["X-Test"]).toBe("hello");
});
