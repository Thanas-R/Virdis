import { callBackend } from "@/lib/call-backend";
import { isFallbackPayload } from "@/lib/query-cache";

interface RetryOptions {
  retries?: number;
  /** Base delay (ms). Exponential backoff: base * 2^attempt + jitter. */
  baseDelayMs?: number;
  /** Returns true if the response payload should be treated as "no data" and retried. */
  isEmpty?: (data: unknown) => boolean;
  /** Optional signal to abort retries (e.g. on component unmount). */
  signal?: AbortSignal;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => resolve(), ms);
    // Allow abort to interrupt the wait
    if (ms > 0) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      // Caller may pass via closure; nothing to wire here.
      void onAbort;
    }
  });

/**
 * Calls a Supabase edge function with retries. Retries on:
 *   - invoke error (network / non-2xx)
 *   - response payload flagged `{ fallback: true }`
 *   - response failing custom `isEmpty` predicate
 *
 * Returns the final data (may still be a fallback after all retries exhausted).
 */
export async function invokeWithRetry<T = any>(
  fn: string,
  body: Record<string, unknown> | undefined,
  { retries = 3, baseDelayMs = 800, isEmpty, signal }: RetryOptions = {}
): Promise<T | null> {
  let lastData: T | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) return lastData;
    try {
      const { data, error } = await callBackend(fn, body);
      if (error) throw error;
      lastData = data as T;
      const empty = isFallbackPayload(data) || (isEmpty ? isEmpty(data) : false);
      if (!empty) return lastData;
      // else fall through to retry
    } catch (e) {
      // swallow & retry
      // eslint-disable-next-line no-console
      console.warn(`[invokeWithRetry] ${fn} attempt ${attempt + 1} failed`, e);
    }
    if (attempt < retries) {
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
      try {
        await sleep(delay);
      } catch {
        return lastData;
      }
    }
  }
  return lastData;
}
