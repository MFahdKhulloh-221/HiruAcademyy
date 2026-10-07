export const AUTH_EXPIRED_EVENT = "hiru:auth-expired";

export class ApiError extends Error {
  constructor(public status: number, public errors: Record<string, string[]> = {}) {
    super(status === 422 ? "Periksa kembali data yang dimasukkan." : status === 401 || status === 419 ? "Sesi berakhir. Silakan masuk kembali." : status === 429 ? "Terlalu banyak percobaan. Silakan coba lagi nanti." : "Permintaan belum berhasil. Silakan coba lagi.");
    this.name = "ApiError";
  }
}

const fieldMessages: Record<string, string> = {
  identity: "Periksa email atau nomor WhatsApp dan kata sandi.",
  name: "Periksa nama lengkap.",
  email: "Periksa alamat email.",
  whatsapp: "Periksa nomor WhatsApp.",
  password: "Periksa kata sandi dan konfirmasinya.",
  password_confirmation: "Konfirmasi kata sandi harus sesuai.",
  country: "Periksa negara.",
  target_jlpt: "Periksa target JLPT.",
  token: "Tautan reset tidak valid atau kedaluwarsa.",
};

let authenticated = false;
let sessionVersion = 0;
let csrfRequest: Promise<void> | null = null;
type PendingRead = { controller: AbortController; task: Promise<unknown>; subscribers: number };
const pendingReads = new Map<string, PendingRead>();

export function setApiAuthenticated(value: boolean, invalidateSession = true) {
  if (!invalidateSession && authenticated === value) return;
  authenticated = value;
  sessionVersion += 1;
  csrfRequest = null;
  for (const read of pendingReads.values()) read.controller.abort();
  pendingReads.clear();
}

function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!base || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.split(/[?#]/)[0].split("/").some(segment => segment === "." || segment === ".." || segment.includes("%"))) throw new ApiError(0);
  try {
    const url = new URL(base + path);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch {
    throw new ApiError(0);
  }
}

async function request(path: string, options: RequestInit): Promise<Response> {
  const version = sessionVersion;
  let response: Response;
  try {
    options.signal?.throwIfAborted();
    response = await fetch(apiUrl(path), { ...options, credentials: "include", cache: "no-store", redirect: "error" });
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0);
  }
  options.signal?.throwIfAborted();
  if (!response.ok) {
    if ((response.status === 401 || response.status === 419) && authenticated && version === sessionVersion && typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const errors: Record<string, string[]> = {};
    if (response.status === 422) {
      const body = await response.json().catch(() => null);
      if (body?.errors && typeof body.errors === "object") {
        for (const key of Object.keys(body.errors)) {
          const field = key === "email_normalized" ? "email" : key === "whatsapp_normalized" ? "whatsapp" : key === "identifier" ? "identity" : key;
          if (Object.hasOwn(fieldMessages, field)) errors[field] = [fieldMessages[field]];
        }
      }
      if (path === "/api/auth/login" && !Object.keys(errors).length) errors.identity = [fieldMessages.identity];
    }
    throw new ApiError(response.status, errors);
  }
  return response;
}

function csrfToken() {
  try {
    const token = typeof document === "undefined" ? undefined : document.cookie.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
    return token ? decodeURIComponent(token) : undefined;
  } catch {
    throw new ApiError(419);
  }
}

async function readResponse<T>(path: string, options: RequestInit): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204 || options.method === "HEAD") return undefined as T;
  try {
    const data = await response.json() as T;
    options.signal?.throwIfAborted();
    return data;
  } catch {
    if (options.signal?.aborted) options.signal.throwIfAborted();
    throw new ApiError(response.status);
  }
}

function sharedRead<T>(key: string, path: string, options: RequestInit): Promise<T> {
  const signal = options.signal;
  signal?.throwIfAborted();
  let read = pendingReads.get(key);
  if (read?.controller.signal.aborted) {
    pendingReads.delete(key);
    read = undefined;
  }
  if (!read) {
    const controller = new AbortController();
    read = { controller, subscribers: 0, task: readResponse(path, { ...options, signal: controller.signal }) };
    pendingReads.set(key, read);
    const current = read;
    const remove = () => { if (pendingReads.get(key) === current) pendingReads.delete(key); };
    void read.task.then(remove, remove);
  }
  const current = read;
  current.subscribers += 1;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    function release() {
      settled = true;
      signal?.removeEventListener("abort", abort);
      current.subscribers -= 1;
      if (!current.subscribers) {
        if (pendingReads.get(key) === current) pendingReads.delete(key);
        current.controller.abort();
      }
    }
    function abort() {
      if (settled) return;
      release();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", abort, { once: true });
    current.task.then(data => {
      if (settled) return;
      release();
      try { resolve(structuredClone(data) as T); } catch (error) { reject(error); }
    }, error => {
      if (settled) return;
      release();
      reject(error);
    });
  });
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  options.signal?.throwIfAborted();
  const version = sessionVersion;
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    let token = csrfToken();
    if (!token) {
      if (!csrfRequest) {
        const task = request("/sanctum/csrf-cookie", { headers: { Accept: "application/json" } }).then(() => undefined).finally(() => { if (csrfRequest === task) csrfRequest = null; });
        csrfRequest = task;
      }
      await csrfRequest;
      token = csrfToken();
    }
    options.signal?.throwIfAborted();
    if (version !== sessionVersion || !token) throw new ApiError(419);
    headers.set("X-XSRF-TOKEN", token);
  }
  if (typeof options.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const init = { ...options, method, headers };
  if (typeof window !== "undefined" && method === "GET" && Object.keys(options).every(key => ["method", "headers", "signal"].includes(key))) {
    const key = JSON.stringify([sessionVersion, apiUrl(path), Array.from(headers.entries()).sort()]);
    return sharedRead<T>(key, path, init);
  }
  return readResponse<T>(path, init);
}
