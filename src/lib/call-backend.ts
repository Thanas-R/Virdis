import { supabase } from "@/integrations/supabase/client";

/**
 * Calls a backend function.
 *
 * Order of preference:
 *   1. `/api/<name>` - Vercel Edge Function (reads MAPBOX_TOKEN, GEE_SERVICE_ACCOUNT_JSON
 *      and GEE_PROJECT_ID from Vercel Environment Variables)
 *   2. Supabase Edge Function - used in the hosted preview, or if `/api` is unavailable
 *
 * The result of the probe is cached per session so we don't pay the 404 round-trip
 * on every call in environments where `/api` isn't deployed.
 */

type BackendResult<T> = { data: T | null; error: unknown };

let apiAvailable: boolean | null = null;

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
  if (apiAvailable !== false) {
    try {
      const result = await callVercelApi<T>(name, body);
      apiAvailable = true;
      return result;
    } catch (e) {
      if (apiAvailable === true) {
        // API exists but this call failed for another reason - still fall back once.
        console.warn(`[callBackend] /api/${name} failed, falling back to Supabase`, e);
      } else {
        apiAvailable = false;
      }
    }
  }

  const { data, error } = await supabase.functions.invoke(name, { body });
  return { data: (data ?? null) as T | null, error };
}
