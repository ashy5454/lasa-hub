import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import * as Location from "expo-location";
import {
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut,
  RecaptchaVerifier,
  type ConfirmationResult,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, firebaseConfig } from "@/lib/firebase";

// expo-firebase-recaptcha only works on native (uses compat SDK)
const FirebaseRecaptchaVerifierModal = Platform.OS !== "web"
  ? require("expo-firebase-recaptcha").FirebaseRecaptchaVerifierModal
  : null;
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

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  recaptchaVerifierRef: React.RefObject<FirebaseRecaptchaVerifierModal | null>;
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
  const [selectedRole, setSelectedRole] = useState<UserRole>("kirana");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<any>(null);

  // Restore cached user on cold start, then sync with server
  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;

    (async () => {
      let cachedUser: User | null = null;
      try {
        const stored = await AsyncStorage.getItem("lasa_user");
        if (stored) {
          cachedUser = JSON.parse(stored) as User;
          setUser(cachedUser);
        }
      } catch {}

      // Listen for Firebase auth state changes
      unsubscribeAuth = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
        if (!fbUser && !cachedUser) {
          setIsLoading(false);
          return;
        }

        // If Firebase has a user, sync their profile from server
        if (fbUser && cachedUser?.phone) {
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
              if (JSON.stringify(merged) !== JSON.stringify(cachedUser)) {
                await AsyncStorage.setItem("lasa_user", JSON.stringify(merged));
                setUser(merged);
              }
            }
          } catch {
            // Server unreachable — keep cached user
          }
        }

        setIsLoading(false);
      });
    })();

    return () => { unsubscribeAuth?.(); };
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    const normalizedPhone = normalizePhone(phone);
    const fullPhone = `+91${normalizedPhone}`;
    let verifier = recaptchaVerifierRef.current;
    if (Platform.OS === "web") {
      // On web: create an invisible RecaptchaVerifier using modular Firebase SDK
      let container = document.getElementById("recaptcha-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "recaptcha-container";
        document.body.appendChild(container);
      }
      verifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      recaptchaVerifierRef.current = verifier;
    }
    if (!verifier) throw new Error("reCAPTCHA not ready");
    const result = await signInWithPhoneNumber(auth, fullPhone, verifier);
    setConfirmationResult(result);
  }, []);

  const verifyOtp = useCallback(async (_phone: string, otp: string, _role: UserRole): Promise<boolean> => {
    if (!confirmationResult) return false;
    try {
      await confirmationResult.confirm(otp);
      return true;
    } catch {
      return false;
    }
  }, [confirmationResult]);

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
    } catch {}

    const base: User = {
      phone: normalizedPhone,
      role,
      name: name.trim() || (role === "wholesaler" ? "Wholesaler" : "Shop Owner"),
      shopName,
      wholesalerId: role === "wholesaler" ? `w_${normalizedPhone}` : undefined,
      lat,
      lng,
    };

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
      }, { "x-user-role": role });

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
    setConfirmationResult(null);
  }, []);

  const loginExistingUser = useCallback(async (existingUser: User) => {
    await AsyncStorage.setItem("lasa_user", JSON.stringify(existingUser));
    setUser(existingUser);
    setConfirmationResult(null);
  }, []);

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
    console.info("[logout] starting…");
    try {
      await signOut(auth);
      console.info("[logout] Firebase signOut ok");
    } catch (err) {
      console.warn("[logout] Firebase signOut failed", err);
    }
    try {
      await AsyncStorage.multiRemove(["lasa_user", "lasa_admin_token"]);
    } catch {}
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try { ["lasa_user", "lasa_admin_token"].forEach(k => window.localStorage?.removeItem(k)); } catch {}
    }
    setConfirmationResult(null);
    setSelectedRole("kirana");
    setUser(null);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try { window.location.href = "/"; return; } catch {}
    } else {
      try { router.replace("/"); } catch {}
    }
  }, []);

  const setRole = useCallback((role: UserRole) => setSelectedRole(role), []);

  return (
    <AuthContext.Provider value={{
      user, isLoading, recaptchaVerifierRef,
      sendOtp, verifyOtp, completeProfile, loginExistingUser, refreshUser,
      logout, setRole, selectedRole,
    }}>
      {Platform.OS !== "web" && FirebaseRecaptchaVerifierModal && (
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifierRef}
          firebaseConfig={firebaseConfig}
          attemptInvisibleVerification
        />
      )}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
