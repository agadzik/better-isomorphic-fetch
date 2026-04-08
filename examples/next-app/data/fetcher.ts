import { fetch } from "better-isomorphic-fetch";

const VERCEL_API = "https://api.vercel.com";
const VERCEL_API_PROXY = "/api/vercel";

function baseUrl() {
  if (typeof window !== "undefined") return VERCEL_API_PROXY;
  return VERCEL_API;
}

function authHeaders(): HeadersInit {
  if (typeof window !== "undefined") return {};
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN is not set");
  return { Authorization: `Bearer ${token}` };
}

export async function vercelFetch<T>(path: string): Promise<T> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, {
    headers: authHeaders(),
    retries: 2,
    retryDelay: 500,
  });

  if (!res.ok) {
    throw new Error(`Vercel API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export function swrFetcher<T>(path: string): Promise<T> {
  return vercelFetch<T>(path);
}
