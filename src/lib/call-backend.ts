/**
 * Calls this deployment's Vercel API route. Server credentials are read only
 * inside `/api/*`; requests never fall through to another backend/provider.
 */

type BackendResult<T> = { data: T | null; error: unknown };

async function callVercelApi<T>(name: string, body?: Record<string, unknown>): Promise<BackendResult<T>> {
  const res = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  // Not deployed (404) or SPA fallback returning HTML -> treat as unavailable
  const contentType = res.headers.get("content-type") || "";
  if (res.status === 404 || !contentType.includes("application/json")) {
    throw new Error("API_UNAVAILABLE");
  }

  const data = (await res.json()) as T;
  if (!res.ok) {
    return { data, error: (data as { error?: unknown })?.error ?? new Error(`HTTP ${res.status}`) };
  }
  return { data, error: null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callBackend<T = any>(
  name: string,
  body?: Record<string, unknown>
): Promise<BackendResult<T>> {
  try {
    return await callVercelApi<T>(name, body);
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error
        ? error
        : new Error(`Vercel API route /api/${name} is unavailable.`),
    };
  }
}
