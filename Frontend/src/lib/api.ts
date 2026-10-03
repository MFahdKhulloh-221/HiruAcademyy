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

export function setApiAuthenticated(value: boolean) {
  authenticated = value;
  sessionVersion += 1;
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
    response = await fetch(apiUrl(path), { ...options, credentials: "include", cache: "no-store", redirect: "error" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0);
  }
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

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!csrfRequest) {
      csrfRequest = request("/sanctum/csrf-cookie", { headers: { Accept: "application/json" } }).then(() => undefined).finally(() => { csrfRequest = null; });
    }
    await csrfRequest;
    let token: string | undefined;
    try {
      token = typeof document === "undefined" ? undefined : document.cookie.split(";").map(cookie => cookie.trim()).find(cookie => cookie.startsWith("XSRF-TOKEN="))?.slice("XSRF-TOKEN=".length);
      token = token ? decodeURIComponent(token) : undefined;
    } catch {
      throw new ApiError(419);
    }
    if (!token) throw new ApiError(419);
    headers.set("X-XSRF-TOKEN", token);
  }
  if (typeof options.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await request(path, { ...options, method, headers });
  if (response.status === 204 || method === "HEAD") return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError(response.status);
  }
}
