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
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, type UserRole } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { LANGUAGES, type Language } from "@/constants/translations";
import { LasaLogo } from "@/components/LasaLogo";
import { apiGet } from "@/constants/api";

type Step = "language" | "phone" | "otp" | "role" | "name";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sendOtp, verifyOtp, completeProfile, loginExistingUser, selectedRole, setRole } = useAuth();
  const { setLanguage, t, language } = useLanguage();

  const [step, setStep] = useState<Step>("language");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLanguageSelect = async (lang: Language) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setLanguage(lang);
    setStep("phone");
  };

  const handleSendOtp = async () => {
    if (phone.length !== 10) {
      setError(t("enterMobile"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      await sendOtp(phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("otp");
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg) {
        setError(msg);
      } else {
        setError("Couldn't send OTP. Please try again.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError(t("enterOtp"));
      return;
    }
    setError("");
    setLoading(true);
    const ok = await verifyOtp(phone, otp, selectedRole);
    if (!ok) {
      setLoading(false);
      setError(t("wrongOtp"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // OTP verified — check if user already exists
    try {
      const { user: existingUser } = await apiGet<{ user: any }>(`/api/users/${encodeURIComponent(phone)}`);
      if (existingUser?.name) {
        await loginExistingUser(existingUser);
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (existingUser.role === "wholesaler") {
          router.replace("/wholesaler" as any);
        } else {
          router.replace("/(tabs)");
        }
        return;
      }
    } catch {
      // New user or server unreachable — proceed to onboarding
    }

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
    if (selectedRole === "wholesaler") {
      router.replace("/wholesaler" as any);
    } else {
      router.replace("/(tabs)");
    }
  };

  const nameLabel = language === "te" ? "మీ పేరు" : language === "hi" ? "आपका नाम" : "Your Name";
  const namePlaceholder = language === "te" ? "పేరు వేయండి" : language === "hi" ? "नाम डालें" : "Enter your name";
  const nameBtn = language === "te" ? "ముందుకు వెళ్ళండి" : language === "hi" ? "आगे बढ़ें" : "Continue";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24), paddingBottom: insets.bottom + 34 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(80).springify()} style={styles.logoSection}>
          <LasaLogo size={step === "language" ? 220 : 150} />
          <Text style={[styles.appName, { color: colors.primary }]}>Lasa Hub</Text>
          {step !== "language" && (
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>{t("appTagline")}</Text>
          )}
        </Animated.View>

        {/* ── Step 0: Language ── */}
        {step === "language" && (
          <Animated.View entering={FadeInUp.delay(160).springify()} style={styles.stepBox}>
            <Text style={[styles.langTitle, { color: colors.foreground }]}>
              Choose language / भाषा / భాష
            </Text>
            {LANGUAGES.map((lang, i) => (
              <Animated.View key={lang.code} entering={FadeInDown.delay(220 + i * 80).springify()}>
                <TouchableOpacity
                  style={[
                    styles.langBtn,
                    {
                      backgroundColor: language === lang.code ? colors.primary : colors.card,
                      borderColor: language === lang.code ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => handleLanguageSelect(lang.code)}
                  activeOpacity={0.82}
                >
                  <Text style={[styles.langNative, { color: language === lang.code ? "#FFF" : colors.foreground }]}>
                    {lang.native}
                  </Text>
                  <Text style={[styles.langEnglish, { color: language === lang.code ? "rgba(255,255,255,0.8)" : colors.mutedForeground }]}>
                    {lang.label}
                  </Text>
                  {language === lang.code && <Feather name="check" size={20} color="#FFF" />}
                </TouchableOpacity>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* ── Step 1: Phone ── */}
        {step === "phone" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <TouchableOpacity onPress={() => setStep("language")} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
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
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t("testHint")}</Text>
          </Animated.View>
        )}

        {/* ── Step 2: OTP ── */}
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

        {/* ── Step 3: Role (new users only) ── */}
        {step === "role" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("whoAreYou")}</Text>
            <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>
              {language === "te" ? "మీరు ఎవరు?" : language === "hi" ? "आप कौन हैं?" : "Tell us about your business"}
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

        {/* ── Step 4: Name (new users only) ── */}
        {step === "name" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <TouchableOpacity onPress={() => setStep("role")} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={[styles.nameSuccessIcon, { backgroundColor: colors.available + "18" }]}>
              <Feather name="check-circle" size={40} color={colors.available} />
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{nameLabel}</Text>
            <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>
              {language === "te" ? "మీ వ్యాపార పేరు వేయండి" : language === "hi" ? "अपना नाम डालें" : "What's your name?"}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, justifyContent: "center" },
  logoSection: { alignItems: "center", marginBottom: 40 },
  appName: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 4 },
  stepBox: { gap: 14 },
  langTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  langBtn: { borderRadius: 16, borderWidth: 1.5, padding: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  langNative: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  langEnglish: { fontSize: 14, fontFamily: "Inter_400Regular" },
  backBtn: { marginBottom: 4, alignSelf: "flex-start" },
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
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  otpInput: { height: 72, borderWidth: 2, borderRadius: 16, fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: 12 },
  resendBtn: { alignItems: "center", paddingVertical: 8 },
  resendText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  nameSuccessIcon: { alignSelf: "center", width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  nameInput: { height: 60, borderWidth: 2, borderRadius: 16, fontSize: 20, fontFamily: "Inter_600SemiBold", paddingHorizontal: 20 },
});
