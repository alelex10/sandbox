import { useCallback, useSyncExternalStore } from "react";

/**
 * Client-side user settings — persisted in localStorage, exposed via
 * `useSyncExternalStore` (React 18.3.1 built-in, no Provider required).
 *
 * Storage key: `settings:v1`. Any read failure, parse error, or unknown
 * `schemaVersion` falls back to the in-code defaults.
 *
 * `display.defaultSortDirection` is persisted for future-proofing; no
 * component reads it yet (sorting is server-side via Prisma `orderBy`).
 */

const STORAGE_KEY = "settings:v1";

type SortDirection = "asc" | "desc";

export interface Settings {
  pagination: { defaultLimit: number };
  display: { defaultSortDirection: SortDirection };
  schemaVersion: 1;
}

const DEFAULTS: Settings = {
  pagination: { defaultLimit: 20 },
  display: { defaultSortDirection: "desc" },
  schemaVersion: 1,
};

function isValidShape(v: unknown): v is Settings {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (o.schemaVersion !== 1) return false;
  const p = o.pagination as Record<string, unknown> | undefined;
  if (typeof p?.defaultLimit !== "number") return false;
  const d = o.display as Record<string, unknown> | undefined;
  return d?.defaultSortDirection === "asc" || d?.defaultSortDirection === "desc";
}

function readFromStorage(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidShape(parsed)) return DEFAULTS;
    return parsed;
  } catch {
    return DEFAULTS;
  }
}

let store: Settings = readFromStorage();

const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): Settings {
  return store;
}

function getServerSnapshot(): Settings {
  return DEFAULTS;
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useSetting<K>(path: string): [K, (next: K) => void] {
  const settings = useSettings();
  const value = getByPath(settings, path) as K;
  const setter = useCallback((next: K) => setSetting(path, next), [path]);
  return [value, setter];
}

export function setSetting(path: string, value: unknown): void {
  store = setByPath(store, path, value);
  listeners.forEach((l) => l());
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    // quota exceeded / storage disabled — in-memory store still updated
  }
}

function getByPath(o: unknown, path: string): unknown {
  const keys = path.split(".");
  let cur: unknown = o;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function setByPath<T extends object>(o: T, path: string, v: unknown): T {
  const keys = path.split(".");
  if (keys.length === 0) return o;
  const root = { ...o } as Record<string, unknown>;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = { ...(cur[k] as Record<string, unknown> | undefined) };
    cur[k] = next;
    cur = next;
  }
  cur[keys[keys.length - 1]] = v;
  return root as T;
}
