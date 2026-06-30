import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Platform } from "react-native";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/constants/api";

export type UserRole = "kirana" | "wholesaler";

export interface User {
  phone: string;
  role: UserRole;
  name: string;
  shopName: string;
  trustedWholesalerId?: string;
  wholesalerId?: string;
  lat?: number;
  lng?: number;
}

function normalizePhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length <= 10) return digits;
  return digits.slice(-10);
}

// Delivery status surfaced by /api/otp/send so the UI can tell the user
// the REAL reason SMS didn't arrive instead of guessing.
//   "sent"    → SMS actually left Twilio; OTP is on the way
//   "skipped" → Twilio creds missing on the server (not configured at all)
//   "failed"  → Twilio rejected the send (trial limit, unverified number,
//               DLT not registered for India, etc.) — check Twilio logs
//   "quota"   → Our own daily server-wide Twilio cap was hit
export type OtpDeliveryStatus = "sent" | "skipped" | "failed" | "quota" | null;

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  generatedOtp: string | null;
  otpDeliveryStatus: OtpDeliveryStatus;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string, role: UserRole) => Promise<boolean>;
  completeProfile: (phone: string, role: UserRole, name: string) => Promise<void>;
  loginExistingUser: (user: User) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  setRole: (role: UserRole) => void;
  selectedRole: UserRole;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpDeliveryStatus, setOtpDeliveryStatus] = useState<OtpDeliveryStatus>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>("kirana");

  useEffect(() => {
    (async () => {
      let cachedUser: User | null = null;
      try {
        const stored = await AsyncStorage.getItem("lasa_user");
        if (stored) {
          cachedUser = JSON.parse(stored) as User;
          setUser(cachedUser);
        }
      } catch {}
      setIsLoading(false);

      // Sync with server on every app start. The server self-heals stale
      // wholesalerId (e.g. after admin cleanup deactivated a duplicate
      // record) so the dashboard reliably resolves the *currently active*
      // wholesaler for this phone, not the one that was cached in
      // localStorage weeks ago.
      if (cachedUser?.phone) {
        try {
          const { user: server } = await apiGet<{ user: any }>(
            `/api/users/${encodeURIComponent(cachedUser.phone)}`
          );
          if (server) {
            const merged: User = {
              ...cachedUser,
              name: server.name ?? cachedUser.name,
              shopName: server.shopName ?? server.shop_name ?? cachedUser.shopName,
              wholesalerId: server.wholesalerId ?? server.wholesaler_id ?? cachedUser.wholesalerId,
              trustedWholesalerId: server.trustedWholesalerId ?? server.trusted_wholesaler_id ?? cachedUser.trustedWholesalerId,
              lat: server.lat ?? cachedUser.lat,
              lng: server.lng ?? cachedUser.lng,
            };
            // Only write back if something actually changed — avoids
            // useless localStorage churn on every cold start.
            if (JSON.stringify(merged) !== JSON.stringify(cachedUser)) {
              await AsyncStorage.setItem("lasa_user", JSON.stringify(merged));
              setUser(merged);
            }
          }
        } catch {
          // Server unreachable → keep cached user, app continues offline.
        }
      }
    })();
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    const normalizedPhone = normalizePhone(phone);
    try {
      // Capture `delivery` too — the server tells us exactly why SMS
      // didn't go (skipped / failed / quota / sent). Storing it on the
      // OTP screen lets us show the real reason instead of the misleading
      // hardcoded "Twilio daily limit hit" banner.
      const result = await apiPost<{ otp?: string; delivery?: string }>(
        "/api/otp/send",
        { phone: normalizedPhone },
      );
      if (result.otp) setGeneratedOtp(result.otp);
      // Narrow the loose `string` from the JSON to our typed union.
      const d = result.delivery;
      const status: OtpDeliveryStatus =
        d === "sent" || d === "skipped" || d === "failed" || d === "quota" ? d : null;
      setOtpDeliveryStatus(status);
    } catch (err: any) {
      // Bubble the error up so the calling screen can show "too many
      // requests", "DB unreachable", etc. The previous version swallowed
      // every failure and the user saw a fake "OTP sent" success state.
      setGeneratedOtp(null);
      setOtpDeliveryStatus(null);
      throw err;
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string, _role: UserRole): Promise<boolean> => {
    const normalizedPhone = normalizePhone(phone);
    try {
      const result = await apiPost<{ valid: boolean }>("/api/otp/verify", { phone: normalizedPhone, otp });
      if (result.valid) return true;
    } catch {
      // Fall through to local fallback below.
    }
    if (otp === generatedOtp) return true;
    return false;
  }, [generatedOtp]);

  const completeProfile = useCallback(async (phone: string, role: UserRole, name: string) => {
    const normalizedPhone = normalizePhone(phone);
    const shopName = name.trim()
      ? `${name.trim()}'s ${role === "wholesaler" ? "Wholesale" : "Kirana"}`
      : role === "wholesaler" ? "My Wholesale" : "My Kirana Store";

    let lat: number | undefined;
    let lng: number | undefined;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      }
    } catch (err) {
      console.warn("Location error:", err);
    }

    const base: User = {
      phone: normalizedPhone,
      role,
      name: name.trim() || (role === "wholesaler" ? "Wholesaler" : "Shop Owner"),
      shopName,
      wholesalerId: role === "wholesaler" ? `w_${normalizedPhone}` : undefined,
      lat,
      lng,
    };

    // Persist to server (fire-and-forget-safe).
    try {
      const { user: serverUser } = await apiPost<{ user: any }>("/api/users/upsert", {
        phone: base.phone,
        role: base.role,
        name: base.name,
        shopName: base.shopName,
        language: "te",
        trustedWholesalerId: base.trustedWholesalerId,
        wholesalerId: base.wholesalerId,
        lat,
        lng,
      });
      if (serverUser) {
        base.name = serverUser.name ?? base.name;
        base.shopName = serverUser.shopName ?? serverUser.shop_name ?? base.shopName;
        base.trustedWholesalerId = serverUser.trustedWholesalerId ?? serverUser.trusted_wholesaler_id ?? base.trustedWholesalerId;
        base.wholesalerId = serverUser.wholesalerId ?? serverUser.wholesaler_id ?? base.wholesalerId;
        base.lat = serverUser.lat ?? base.lat;
        base.lng = serverUser.lng ?? base.lng;
      }
    } catch (err) {
      console.warn("User upsert failed, continuing offline:", (err as Error).message);
    }

    await AsyncStorage.setItem("lasa_user", JSON.stringify(base));
    setUser(base);
    setGeneratedOtp(null);
  }, []);

  const loginExistingUser = useCallback(async (existingUser: User) => {
    await AsyncStorage.setItem("lasa_user", JSON.stringify(existingUser));
    setUser(existingUser);
    setGeneratedOtp(null);
  }, []);

  /**
   * Pulls the canonical user record from the server and merges it into the
   * locally cached one. Call this after the wholesaler renames their shop
   * (so the dashboard header refreshes) or any time you suspect drift.
   */
  const refreshUser = useCallback(async () => {
    if (!user?.phone) return;
    try {
      const { user: server } = await apiGet<{ user: any }>(`/api/users/${encodeURIComponent(user.phone)}`);
      if (!server) return;
      const merged: User = {
        ...user,
        name: server.name ?? user.name,
        shopName: server.shopName ?? server.shop_name ?? user.shopName,
        wholesalerId: server.wholesalerId ?? server.wholesaler_id ?? user.wholesalerId,
        trustedWholesalerId: server.trustedWholesalerId ?? server.trusted_wholesaler_id ?? user.trustedWholesalerId,
        lat: server.lat ?? user.lat,
        lng: server.lng ?? user.lng,
      };
      await AsyncStorage.setItem("lasa_user", JSON.stringify(merged));
      setUser(merged);
    } catch (err) {
      console.warn("refreshUser failed:", (err as Error).message);
    }
  }, [user]);

  const logout = useCallback(async () => {
    // ── BULLETPROOF LOGOUT (web) ──────────────────────────────────────────
    // The previous version relied on AsyncStorage.multiRemove + a single
    // window.location.assign(). In practice this could fail silently if
    // localStorage threw (e.g. quota, extension interference) or if the
    // route-guard fired router.replace before the hard reload kicked in.
    // This version is brute-force: clear EVERY storage layer we know of,
    // log each step to the console so the user can diagnose failures, and
    // attempt navigation through three different mechanisms.
    console.info("[logout] starting…");

    try {
      await AsyncStorage.multiRemove(["lasa_user", "lasa_admin_token"]);
      console.info("[logout] AsyncStorage.multiRemove ok");
    } catch (err) {
      console.warn("[logout] AsyncStorage.multiRemove failed", err);
    }

    // Belt-and-suspenders: explicitly wipe every browser storage layer
    // even if AsyncStorage's web shim already did it. localStorage and
    // sessionStorage can drift in dev when the app is reloaded mid-write.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const keys = ["lasa_user", "lasa_admin_token"];
      try { keys.forEach(k => window.localStorage?.removeItem(k)); } catch {}
      try { keys.forEach(k => window.sessionStorage?.removeItem(k)); } catch {}
      console.info("[logout] browser storage cleared");
    }

    setGeneratedOtp(null);
    setSelectedRole("kirana");
    setUser(null);

    // Navigate. On web we want a *full* page reload so no React state
    // survives. Try three methods in order — at least one always wins.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      console.info("[logout] redirecting to /…");
      try { window.location.href = "/"; return; } catch (err) {
        console.warn("[logout] location.href failed", err);
      }
      try { window.location.replace("/"); return; } catch (err) {
        console.warn("[logout] location.replace failed", err);
      }
      try { window.location.assign("/"); return; } catch (err) {
        console.warn("[logout] location.assign failed", err);
      }
      // If we somehow reach here, force a hard reload as a last resort.
      window.location.reload();
    } else {
      try { router.replace("/"); } catch (err) { console.warn("logout: navigation failed", err); }
    }
  }, []);

  const setRole = useCallback((role: UserRole) => setSelectedRole(role), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, generatedOtp, otpDeliveryStatus, sendOtp, verifyOtp, completeProfile, loginExistingUser, refreshUser, logout, setRole, selectedRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
