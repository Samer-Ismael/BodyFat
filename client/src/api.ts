let currentUserId: number | null = null;

export function setApiUserId(id: number): void {
  currentUserId = id;
}

export function getApiUserId(): number | null {
  return currentUserId;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (currentUserId != null) {
    headers.set("X-User-Id", String(currentUserId));
  }
  const r = await fetch(`/api${path}`, { ...init, headers });
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data as T;
}
