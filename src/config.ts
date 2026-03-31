const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;
const DD_SITE = process.env.DD_SITE || "datadoghq.com";

if (!DD_API_KEY || !DD_APP_KEY) {
  throw new Error("DD_API_KEY and DD_APP_KEY environment variables are required");
}

export const config = {
  apiKey: DD_API_KEY,
  appKey: DD_APP_KEY,
  site: DD_SITE,
} as const;

export function apiUrl(path: string): string {
  return `https://api.${config.site}${path}`;
}

export function authHeaders(): Record<string, string> {
  return {
    "DD-API-KEY": config.apiKey,
    "DD-APPLICATION-KEY": config.appKey,
    "Content-Type": "application/json",
  };
}

export async function ddFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Datadog API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function ddGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(apiUrl(path));
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Datadog API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}
