// Fetch wrapper. The session token lives in an HttpOnly cookie (set on login) and in
// localStorage for the Authorization header. Parent mode on the tablet uses a short-lived
// in-memory token that overrides it.
import type { User } from '../../shared/types.ts';

const KEY = 'jt.token';
let elevatedToken: string | null = null;

function storedToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: cookie still works */
  }
}

export function setElevatedToken(token: string | null) {
  elevatedToken = token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: BodyInit | object, contentType?: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = elevatedToken ?? storedToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    payload = body as BodyInit;
    headers['Content-Type'] = contentType ?? (body instanceof Blob ? body.type : 'application/octet-stream');
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? res.statusText, data ?? {});
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: object) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: object) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body: object) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(method: 'PUT' | 'POST', url: string, blob: Blob) => request<T>(method, url, blob, blob.type.split(';')[0]),
};

export interface LoginResult {
  token: string;
  user: User;
}
