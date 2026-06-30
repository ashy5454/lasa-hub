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

type Step = "language" | "role" | "phone" | "otp" | "name";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { sendOtp, verifyOtp, completeProfile, loginExistingUser, generatedOtp, otpDeliveryStatus, selectedRole, setRole } = useAuth();
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
    setStep("role");
  };

  const handleRoleSelect = (role: UserRole) => {
    setRole(role);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      // Server returns a precise message + retryAfterSec for each rate-limit
      // reason (cooldown / phone_limit / ip_limit). Prefer the server message
      // verbatim — it's already user-friendly and tells the user exactly how
      // long to wait. Only fall back to a generic message when nothing came
      // through (e.g. network down).
      const msg = String(err?.message ?? "");
      if (msg) {
        setError(msg);
      } else if (/network|fetch|failed to fetch/i.test(msg)) {
        setError("Couldn't reach the server. Check your internet and try again.");
      } else {
        setError("Couldn't send OTP. Please try again.");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 4) {
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

    try {
      const { user: existingUser } = await import("@/constants/api").then(m => m.apiGet<{ user: import("@/context/AuthContext").User }>(`/api/users/${encodeURIComponent(phone)}`));
      if (existingUser) {
        if (existingUser.role !== selectedRole) {
          setLoading(false);
          setError(`This number is registered as a ${existingUser.role}. Please switch roles on the first screen.`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }
        await loginExistingUser(existingUser);
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (selectedRole === "wholesaler") {
          router.replace("/wholesaler" as any);
        } else {
          router.replace("/(tabs)");
        }
        return;
      }
    } catch {
      // User doesn't exist or network error, proceed to name step
    }

    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  const nameGreeting = language === "te" ? "OTP ధృవీకరించబడింది! మీ పేరు వేయండి." : language === "hi" ? "OTP सही है! अपना नाम डालें।" : "OTP verified! Please enter your name.";

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
        {/* Logo — extra-large on the language step (the very first
            screen a new user sees) and still generous on subsequent
            steps. Sizes are bumped beyond the visible artwork because
            the JPEG has white padding around the sticker that
            resizeMode="contain" preserves — so a 220px container only
            shows ~140px of actual red sticker. Tune these numbers if
            the source artwork is ever re-exported with a tighter crop. */}
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

        {/* ── Step 1: Role ── */}
        {step === "role" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("whoAreYou")}</Text>
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
            <TouchableOpacity onPress={() => setStep("language")} style={styles.backLink}>
              <Feather name="globe" size={14} color={colors.mutedForeground} />
              <Text style={[styles.backLinkText, { color: colors.mutedForeground }]}>
                {language === "te" ? "భాష మార్చు" : language === "hi" ? "भाषा बदलें" : "Change language"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Step 2: Phone ── */}
        {step === "phone" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <TouchableOpacity onPress={() => setStep("role")} style={styles.backBtn}>
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

        {/* ── Step 3: OTP ── */}
        {step === "otp" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <TouchableOpacity onPress={() => setStep("phone")} style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t("enterOtp")}</Text>
            <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>
              {t("otpSentTo")} +91 {phone}
            </Text>
            {generatedOtp ? (
              <Animated.View entering={FadeIn.springify()} style={[styles.otpPreviewBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1 }]}>
                {/* TOP LINE — describes what just happened. The previous
                    version was a hardcoded "Couldn't send SMS" which
                    looked like a contradiction when Twilio actually
                    accepted the message. Now it's truthful per status. */}
                <Text style={[styles.otpPreviewLabel, { color: "#92400E" }]}>
                  {otpDeliveryStatus === "sent"
                    ? language === "te"
                      ? "SMS పంపబడింది. టెస్ట్ కోసం OTP కూడా ఇక్కడ చూపబడింది:"
                      : language === "hi"
                      ? "SMS भेज दिया गया। टेस्ट के लिए OTP यहाँ भी दिखाया जा रहा है:"
                      : "SMS was sent. OTP is also shown here for testing:"
                    : language === "te"
                    ? "SMS పంపలేకపోయాము — టెస్ట్ కోసం OTP:"
                    : language === "hi"
                    ? "SMS नहीं भेज सके — टेस्ट के लिए OTP:"
                    : "Couldn't send SMS — fallback OTP for testing:"}
                </Text>
                <Text style={[styles.otpPreviewCode, { color: "#92400E" }]}>{generatedOtp}</Text>
                {/* BOTTOM LINE — what to do about it. Each branch points
                    the operator at the actual fix location so launches
                    debug faster. */}
                <Text style={{ fontSize: 10, color: "#92400E", marginTop: 4, fontFamily: "Inter_400Regular" }}>
                  {otpDeliveryStatus === "skipped"
                    ? "Server hasn't been given Twilio credentials yet — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER on the backend host."
                    : otpDeliveryStatus === "failed"
                    ? "Twilio rejected the send. Common causes: trial account (the number isn't in Verified Caller IDs), DLT template not registered for India SMS, or the From number is wrong. Check Twilio Console → Monitor → Logs."
                    : otpDeliveryStatus === "quota"
                    ? "Server-side daily Twilio cap reached. Raise TWILIO_DAILY_LIMIT env var on the backend, or wait until tomorrow."
                    : otpDeliveryStatus === "sent"
                    ? "Dev mode: OTP is shown above for testing because SHOW_OTP_IN_RESPONSE is true on the server. Set it to false in production so only the SMS contains the OTP."
                    : "Showing fallback OTP because SHOW_OTP_IN_RESPONSE is enabled on the server. Set it to false in production once SMS works."}
                </Text>
              </Animated.View>
            ) : null}
            <TextInput
              style={[styles.otpInput, { borderColor: colors.primary, color: colors.foreground, backgroundColor: colors.card }]}
              placeholder="- - - -"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              maxLength={4}
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

        {/* ── Step 4: Name ── */}
        {step === "name" && (
          <Animated.View entering={FadeInUp.springify()} style={styles.stepBox}>
            <View style={[styles.nameSuccessIcon, { backgroundColor: colors.available + "18" }]}>
              <Feather name="check-circle" size={40} color={colors.available} />
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{nameLabel}</Text>
            <Text style={[styles.stepSub, { color: colors.mutedForeground }]}>{nameGreeting}</Text>
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
  logoCircle: { width: 80, height: 80, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  appName: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  tagline: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 4 },
  stepBox: { gap: 14 },
  langTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
  langBtn: { borderRadius: 16, borderWidth: 1.5, padding: 20, flexDirection: "row", alignItems: "center", gap: 12 },
  langNative: { fontSize: 22, fontFamily: "Inter_700Bold", flex: 1 },
  langEnglish: { fontSize: 14, fontFamily: "Inter_400Regular" },
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
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  otpPreviewBox: { borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center" },
  otpPreviewLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  otpPreviewCode: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 4 },
  otpInput: { height: 72, borderWidth: 2, borderRadius: 16, fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: 12 },
  resendBtn: { alignItems: "center", paddingVertical: 8 },
  resendText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  nameSuccessIcon: { alignSelf: "center", width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  nameInput: { height: 60, borderWidth: 2, borderRadius: 16, fontSize: 20, fontFamily: "Inter_600SemiBold", paddingHorizontal: 20 },
});
