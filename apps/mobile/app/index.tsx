import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { LANGUAGES, type Language } from "@/constants/translations";
import { LasaLogo } from "@/components/LasaLogo";
import { apiGet } from "@/constants/api";

type Step = "splash" | "phone" | "otp" | "role" | "name";

const GET_STARTED: Record<Language, string> = {
  te: "ప్రారంభించండి",
  hi: "शुरू करें",
  en: "Get Started",
};

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sendOtp, verifyOtp, completeProfile, loginExistingUser, selectedRole, setRole } = useAuth();
  const { setLanguage, t, language } = useLanguage();

  const [step, setStep] = useState<Step>("splash");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async () => {
    if (phone.length !== 10) { setError(t("enterMobile")); return; }
    setError("");
    setLoading(true);
    try {
      await sendOtp(phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("otp");
    } catch (err: any) {
      setError(String(err?.message ?? "Couldn't send OTP. Please try again."));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { setError(t("enterOtp")); return; }
    setError("");
    setLoading(true);
    const ok = await verifyOtp(phone, otp, selectedRole);
    if (!ok) {
      setLoading(false);
      setError(t("wrongOtp"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    try {
      const { user: existingUser } = await apiGet<{ user: any }>(`/api/users/${encodeURIComponent(phone)}`);
      if (existingUser?.name) {
        await loginExistingUser(existingUser);
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(existingUser.role === "wholesaler" ? "/wholesaler" as any : "/(tabs)");
        return;
      }
    } catch {}
    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep("role");
  };

  const handleRoleSelect = (role: UserRole) => {
    setRole(role);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep("name");
  };

  const handleCompleteName = async () => {
    if (!name.trim()) {
      setError(language === "te" ? "మీ పేరు వేయండి" : language === "hi" ? "अपना नाम डालें" : "Please enter your name");
      return;
    }
    setLoading(true);
    await completeProfile(phone, selectedRole, name.trim());
    setLoading(false);
    router.replace(selectedRole === "wholesaler" ? "/wholesaler" as any : "/(tabs)");
  };

  const namePlaceholder = language === "te" ? "పేరు వేయండి" : language === "hi" ? "नाम डालें" : "Enter your name";
  const nameBtn = language === "te" ? "ముందుకు వెళ్ళండి" : language === "hi" ? "आगे बढ़ें" : "Continue";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* ── Splash ── */}
      {step === "splash" && (
        <View style={[styles.splashRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}>
          {/* Language pills — top right */}
          <Animated.View entering={FadeIn.delay(200)} style={styles.langPills}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langPill,
                  {
                    backgroundColor: language === lang.code ? colors.primary : colors.card,
                    borderColor: language === lang.code ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setLanguage(lang.code);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.langPillText, { color: language === lang.code ? "#FFF" : colors.foreground }]}>
                  {lang.native}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          {/* Hero */}
          <View style={styles.splashHero}>
            <Animated.View entering={FadeInDown.delay(100).springify()}>
              <LasaLogo size={180} />
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(220).springify()} style={[styles.splashTitle, { color: colors.primary }]}>
              Lasa Hub
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(320).springify()} style={[styles.splashTagline, { color: colors.mutedForeground }]}>
              {t("appTagline")}
            </Animated.Text>
          </View>

          {/* CTA */}
          <Animated.View entering={FadeInUp.delay(440).springify()} style={styles.splashCta}>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setStep("phone");
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaBtnText}>{GET_STARTED[language]}</Text>
              <Feather name="arrow-right" size={22} color="#FFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* ── All other steps ── */}
      {step !== "splash" && (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24), paddingBottom: insets.bottom + 34 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.logoSection}>
            <LasaLogo size={120} />
            <Text style={[styles.appName, { color: colors.primary }]}>Lasa Hub</Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>{t("appTagline")}</Text>
          </Animated.View>

          {/* Phone */}
          {step === "phone" && (
            <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("enterMobile")}</Text>
              <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>{t("otpWillBeSent")}</Text>
              <View style={[styles.phoneInputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.countryCode, { color: colors.foreground }]}>+91</Text>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <TextInput
                  style={[styles.phoneInput, { color: colors.foreground }]}
                  placeholder="XXXXXXXXXX"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(v) => { setPhone(v); setError(""); }}
                  autoFocus
                />
              </View>
              {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                onPress={handleSendOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>{t("sendOtp")}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep("splash")} style={styles.backLink}>
                <Feather name="arrow-left" size={14} color={colors.mutedForeground} />
                <Text style={[styles.backLinkText, { color: colors.mutedForeground }]}>Back</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* OTP */}
          {step === "otp" && (
            <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
              <TouchableOpacity onPress={() => setStep("phone")} style={styles.backBtn}>
                <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("enterOtp")}</Text>
              <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>
                {t("otpSentTo")} +91 {phone}
              </Text>
              <TextInput
                style={[styles.otpInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.card }]}
                placeholder="- - - - - -"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={(v) => { setOtp(v); setError(""); }}
                textAlign="center"
                autoFocus
              />
              {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                onPress={handleVerifyOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>{t("loginBtn")}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSendOtp} style={styles.resendBtn}>
                <Text style={[styles.resendText, { color: colors.primary }]}>{t("resendOtp")}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Role (new users only) */}
          {step === "role" && (
            <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("whoAreYou")}</Text>
              <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>
                {language === "te" ? "మీ వ్యాపారం గురించి చెప్పండి" : language === "hi" ? "अपने बिज़नेस के बारे में बताएं" : "Tell us about your business"}
              </Text>
              <TouchableOpacity
                style={[styles.roleBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleRoleSelect("kirana")}
                activeOpacity={0.85}
              >
                <Feather name="home" size={30} color="#FFF" />
                <Text style={styles.roleBtnText}>{t("kiranaDukaan")}</Text>
                <Text style={styles.roleBtnSub}>{t("iOrderGoods")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleBtn, { backgroundColor: colors.accent }]}
                onPress={() => handleRoleSelect("wholesaler")}
                activeOpacity={0.85}
              >
                <Feather name="truck" size={30} color="#FFF" />
                <Text style={styles.roleBtnText}>{t("wholesaleDukaan")}</Text>
                <Text style={styles.roleBtnSub}>{t("iFulfillOrders")}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Name (new users only) */}
          {step === "name" && (
            <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
              <TouchableOpacity onPress={() => setStep("role")} style={styles.backBtn}>
                <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
              <View style={[styles.nameSuccessIcon, { backgroundColor: colors.available + "18" }]}>
                <Feather name="check-circle" size={40} color={colors.available} />
              </View>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>
                {language === "te" ? "మీ పేరు" : language === "hi" ? "आपका नाम" : "Your Name"}
              </Text>
              <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>
                {language === "te" ? "మీ వ్యాపార పేరు వేయండి" : language === "hi" ? "अपना नाम डालें" : "What should we call you?"}
              </Text>
              <TextInput
                style={[styles.nameInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.card }]}
                placeholder={namePlaceholder}
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={(v) => { setName(v); setError(""); }}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCompleteName}
              />
              {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                onPress={handleCompleteName}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Text style={styles.primaryBtnText}>{nameBtn}</Text>
                    <Feather name="arrow-right" size={20} color="#FFF" />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Splash
  splashRoot: { flex: 1, paddingHorizontal: 28 },
  langPills: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  langPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  langPillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  splashHero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  splashTitle: { fontSize: 40, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  splashTagline: { fontSize: 17, fontFamily: "Inter_400Regular", textAlign: "center" },
  splashCta: { gap: 0 },
  ctaBtn: { height: 62, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  ctaBtnText: { color: "#FFF", fontSize: 20, fontFamily: "Inter_700Bold" },

  // Shared
  scroll: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center" },
  logoSection: { alignItems: "center", marginBottom: 40, gap: 6 },
  appName: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 14, fontFamily: "Inter_400Regular" },
  stepBox: { gap: 14 },
  backBtn: { marginBottom: 4, alignSelf: "flex-start" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingTop: 4 },
  backLinkText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  stepTitle: { fontSize: 24, fontFamily: "Inter_700Bold", lineHeight: 32 },
  stepSub: { fontSize: 14, fontFamily: "Inter_400Regular" },
  roleBtn: { borderRadius: 16, padding: 22, alignItems: "center", gap: 8 },
  roleBtnText: { color: "#FFF", fontSize: 20, fontFamily: "Inter_700Bold" },
  roleBtnSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontFamily: "Inter_400Regular" },
  phoneInputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, height: 60, paddingHorizontal: 16 },
  countryCode: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  divider: { width: 1, height: 28, marginHorizontal: 12 },
  phoneInput: { flex: 1, fontSize: 20, fontFamily: "Inter_500Medium", letterSpacing: 1 },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  primaryBtn: { height: 58, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 4 },
  primaryBtnText: { color: "#FFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  otpInput: { height: 72, borderWidth: 2, borderRadius: 16, fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: 12 },
  resendBtn: { alignItems: "center", paddingVertical: 8 },
  resendText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  nameSuccessIcon: { alignSelf: "center", width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  nameInput: { height: 60, borderWidth: 2, borderRadius: 16, fontSize: 20, fontFamily: "Inter_600SemiBold", paddingHorizontal: 20 },
});
