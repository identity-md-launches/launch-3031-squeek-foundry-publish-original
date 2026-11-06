import { useEffect, useState } from "react";
import {
  ENDPOINTS,
  parseStatus,
  parseEconomy,
  type LiveStatus,
} from "./source";
export type Resource<T> = {
  data: T | null;
  error: string | null;
  fetchedAt: number;
  loading: boolean;
};
function useResource<T>(
  url: string,
  period: number,
  parse: (v: unknown) => T,
  retry: number,
): Resource<T> {
  const [state, setState] = useState<Resource<T>>({
    data: null,
    error: null,
    fetchedAt: 0,
    loading: true,
  });
  useEffect(() => {
    let stopped = false,
      busy = false,
      failures = 0,
      timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let lastAttempt = 0;
    const poll = async () => {
      if (stopped || busy) return;
      if (document.hidden) {
        timer = setTimeout(poll, period);
        return;
      }
      busy = true;
      lastAttempt = Date.now();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      let delay = period;
      try {
        setState((s) => ({ ...s, loading: true }));
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const raw = response.headers.get("Retry-After");
          const retryMs = raw
            ? Number.isFinite(Number(raw))
              ? Number(raw) * 1000
              : Date.parse(raw) - Date.now()
            : 0;
          delay = Math.max(period, Math.min(900000, retryMs || 0));
          throw Error(`HTTP ${response.status}`);
        }
        const data = parse(await response.json());
        if (!stopped)
          setState({
            data,
            error: null,
            fetchedAt: Date.now(),
            loading: false,
          });
        failures = 0;
      } catch (e) {
        failures++;
        delay = Math.max(
          delay,
          Math.min(900000, period * 2 ** Math.min(failures, 5)),
        );
        if (!stopped)
          setState((s) => ({
            ...s,
            error: e instanceof Error ? e.message : "Network error",
            loading: false,
          }));
      } finally {
        clearTimeout(timeout);
        busy = false;
        if (!stopped) timer = setTimeout(poll, delay);
      }
    };
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        timer = setTimeout(
          poll,
          Math.max(0, period - (Date.now() - lastAttempt)),
        );
      }
    };
    void poll();
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [url, period, parse, retry]);
  return state;
}
const identity = (v: unknown) => v;
export function useLive(retry: number) {
  const status = useResource<LiveStatus>(
      ENDPOINTS.status,
      15000,
      parseStatus,
      retry,
    ),
    economy = useResource(ENDPOINTS.economy, 60000, parseEconomy, retry),
    settlements = useResource(ENDPOINTS.settlements, 60000, identity, retry);
  return { status, economy, settlements };
}
