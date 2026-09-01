import type {
  RegisterPayload,
  LoginPayload,
  AuthResponse,
} from "../types/auth";
import { BASE_URL } from "./apiConfig";

// ── "Just logged in" flag key ──────────────────────────────────────────────
const JUST_LOGGED_IN_KEY = "agf_just_logged_in";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ── Real API request ──────────────────────────────────── */
async function request<T>(endpoint: string, options: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? data.message ?? "Something went wrong");
    }
    return data as T;
  } catch (error: any) {
    clearTimeout(timeout);

    // Handle timeout
    if (error.name === "AbortError") {
      throw new Error("Something went wrong. Please try again.");
    }

    // Handle network errors
    if (
      !navigator.onLine ||
      error.message === "Failed to fetch" ||
      error.message === "NetworkError"
    ) {
      throw new Error(
        "No internet connection. Please check your network and try again.",
      );
    }

    // Re-throw the error if it's already a user-friendly message
    if (error.message && !error.message.includes("fetch")) {
      throw error;
    }

    throw new Error("Something went wrong. Please try again.");
  }
}

function clearStoredSession() {
  localStorage.removeItem("agf_token");
  localStorage.removeItem("agf_user");
  localStorage.removeItem("agf_session_time");
  sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
}

/* ── Auth Service ──────────────────────────────────────── */
export const authService = {
  register: async (payload: RegisterPayload): Promise<AuthResponse> => {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        password: payload.password,
        role: payload.role,
      }),
    });
  },

  login: async (payload: LoginPayload): Promise<AuthResponse> => {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      identifier: payload.identifier,
      password: payload.password,
    }),
  });
},

  saveSession: (res: AuthResponse) => {
    localStorage.setItem("agf_token", res.token);
    localStorage.setItem("agf_user", JSON.stringify(res.user));
    localStorage.setItem("agf_session_time", Date.now().toString());
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, "1");
  },

  // Returns true exactly once per login — reading it clears it
  consumeJustLoggedIn: (): boolean => {
    const flag = sessionStorage.getItem(JUST_LOGGED_IN_KEY);
    if (flag) {
      sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
      return true;
    }
    return false;
  },

  // Refresh timestamp every time user opens the app
  refreshSession: () => {
    if (localStorage.getItem("agf_token")) {
      localStorage.setItem("agf_session_time", Date.now().toString());
    }
  },

  // Check if session is still valid (within 7 days)
  isSessionValid: (): boolean => {
    const token = localStorage.getItem("agf_token");
    const savedTime = localStorage.getItem("agf_session_time");
    if (!token || !savedTime) return false;

    const started = parseInt(savedTime, 10);
    // A non-numeric timestamp made `elapsed` NaN, and `NaN > duration` is
    // false — so a corrupt value was treated as a valid session forever.
    if (!Number.isFinite(started)) {
      clearStoredSession();
      return false;
    }

    if (Date.now() - started > SESSION_DURATION_MS) {
      // Expired — clear everything
      clearStoredSession();
      return false;
    }
    return true;
  },

  getToken: () => localStorage.getItem("agf_token"),

  getUser: () => {
    const raw = localStorage.getItem("agf_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupted storage used to throw here and break the whole app on boot,
      // with no way for the user to recover except clearing site data.
      console.error("Stored user data was unreadable — clearing it");
      localStorage.removeItem("agf_user");
      return null;
    }
  },

  setUser: (user: any) => {
    localStorage.setItem("agf_user", JSON.stringify(user));
  },

  clearSession: () => {
    clearStoredSession();
  },

  isLoggedIn: (): boolean => {
    return !!localStorage.getItem("agf_token");
  },
};

/* ── Content images from backend ───────────────────────── */
export async function getContentImages(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${BASE_URL}/content`);
    const data = await res.json();
    const map: Record<string, string> = {};
    if (data.images) {
      data.images.forEach((img: { key: string; imageUrl: string }) => {
        map[img.key] = img.imageUrl;
      });
    }
    return map;
  } catch {
    return {};
  }
}
