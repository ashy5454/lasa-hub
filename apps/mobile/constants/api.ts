import { Platform } from "react-native";

function getApiBase(): string {
  const explicit = process.env.EXPO_PUBLIC_API_BASE;
  if (explicit && explicit.length > 0) return explicit.replace(/\/$/, "");

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:8080";
    if (host.includes("replit.dev") || host.includes("janeway")) {
      const match = host.match(
        /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(\d+)-(.+)$/i,
      );
      if (match) return `https://${match[1]}-8080-${match[3]}`;
    }
    return ""; // Firebase Hosting — same origin, /api/** rewritten to Cloud Function
  }
  return "http://localhost:8080";
}

export const API_BASE = getApiBase();

// Lazily import Firebase auth to avoid circular deps — resolved at call time.
async function getFirebaseIdToken(): Promise<string | null> {
  try {
    const { auth } = await import("@/lib/firebase");
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const idToken = await getFirebaseIdToken();
  const authHeader: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {};
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...authHeader, ...(extraHeaders ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let err = `HTTP ${res.status}`;
    try { err = (await res.text()) || err; } catch {}
    throw new Error(err);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiGet = <T = any>(path: string, headers?: Record<string, string>) => request<T>("GET", path, undefined, headers);
export const apiPost = <T = any>(path: string, body: Record<string, unknown>, headers?: Record<string, string>) => request<T>("POST", path, body, headers);
export const apiPatch = <T = any>(path: string, body: Record<string, unknown>, headers?: Record<string, string>) => request<T>("PATCH", path, body, headers);
export const apiDelete = <T = any>(path: string, headers?: Record<string, string>) => request<T>("DELETE", path, undefined, headers);

// Role headers sent alongside the Firebase ID token — server reads both.
export function getUserHeaders(user?: { phone?: string; role?: string; wholesalerId?: string } | null): Record<string, string> | undefined {
  if (!user?.role) return undefined;
  return {
    "x-user-role": user.role,
    ...(user.wholesalerId ? { "x-user-wholesaler-id": user.wholesalerId } : {}),
  };
}
