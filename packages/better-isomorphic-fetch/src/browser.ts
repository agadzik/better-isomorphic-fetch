import { withRetry, type BetterFetchInit } from "./retry";

async function doFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return globalThis.fetch(input, init);
}

export async function fetch(
  input: RequestInfo | URL,
  init?: BetterFetchInit,
): Promise<Response> {
  return withRetry(doFetch, input, init);
}
