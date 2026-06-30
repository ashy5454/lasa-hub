import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiPost } from "@/constants/api";
import { pickName } from "@/data/wholesalers";
import { LasaLogo } from "@/components/LasaLogo";

interface ParsedItem {
  name: string;
  nameTe?: string;
  nameHi?: string;
  sourceLanguage?: "en" | "te" | "hi" | null;
  quantity: string;
  available: boolean;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

function getSpeechLang(lang: string) {
  if (lang === "te") return "te-IN";
  if (lang === "hi") return "hi-IN";
  return "en-IN";
}

export default function VoiceOrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [permissionState, setPermissionState] = useState<"unknown" | "granted" | "denied">("unknown");
  const [manualText, setManualText] = useState("");
  const [showManualInput, setShowManualInput] = useState(Platform.OS !== "web");

  // Refs are critical: the `onresult` callback closes over state at the moment
  // it's registered, so reading `transcript` from state after stop gives the
  // value at the time the recognizer started — i.e. empty string. Accumulate
  // into a ref instead and copy to state for display.
  const transcriptRef = useRef("");
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);

  const pulseScale = useSharedValue(1);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      setSpeechSupported(!!SpeechRec);
    } else {
      // Native: we rely on a different transport (not implemented yet)
      setSpeechSupported(false);
    }
  }, []);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(withTiming(1.18, { duration: 550 }), -1, true);
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // ── Speech engine helpers ────────────────────────────────────────────────
  const cleanupTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const stopRecognitionAndProcess = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    cleanupTimer();
    setIsRecording(false);
    // Tell the engine to stop; it will fire onend asynchronously.
    try { recognitionRef.current?.stop?.(); } catch {}
    // Give onresult a moment to emit any final segment.
    await new Promise((r) => setTimeout(r, 250));
    recognitionRef.current = null;

    const finalTranscript = transcriptRef.current.trim();
    setTranscript(finalTranscript);

    if (!finalTranscript) {
      setParseError(
        language === "te"
          ? "మాట వినపడలేదు. మళ్ళీ ప్రయత్నించండి."
          : language === "hi"
          ? "आवाज़ नहीं सुनाई दी। फिर से कोशिश करें।"
          : "Didn't catch that. Tap the mic and speak clearly close to the phone.",
      );
      stoppingRef.current = false;
      return;
    }

    setIsProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const result = await apiPost<{ items: any[]; sourceLanguage: string | null }>(
        "/api/ai/parse-voice",
        { transcript: finalTranscript, language },
      );
      if (Array.isArray(result.items) && result.items.length > 0) {
        const items: ParsedItem[] = result.items.map((i: any) => ({
          name: i.name ?? "Item",
          nameTe: i.nameTe ?? "",
          nameHi: i.nameHi ?? "",
          sourceLanguage: (result.sourceLanguage as any) ?? null,
          quantity: i.quantity ?? "1",
          available: true,
        }));
        setParsedItems(items);
      } else {
        throw new Error("AI returned no items");
      }
    } catch (err: any) {
      setParseError(`Couldn't understand the order: ${err?.message ?? "unknown"}. Try again or use the photo / manual option.`);
    } finally {
      setIsProcessing(false);
      stoppingRef.current = false;
    }
  }, [language]);

  const startRecording = useCallback(async () => {
    setParseError(null);
    setTranscript("");
    transcriptRef.current = "";
    setRecordSeconds(0);

    if (Platform.OS !== "web") {
      setParseError("Voice on mobile native is not yet wired. Use the photo option or open the web app.");
      return;
    }
    if (typeof window === "undefined") return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechSupported(false);
      setParseError("This browser doesn't support voice input. Try Chrome or Edge.");
      return;
    }

    // Pre-check microphone permission so we can show a meaningful error.
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPermissionState("granted");
    } catch (err: any) {
      setPermissionState("denied");
      setParseError(
        err?.name === "NotAllowedError"
          ? "Microphone access blocked. Click the lock icon in your browser address bar and allow microphone for this page."
          : `Couldn't access the microphone: ${err?.message ?? "unknown"}.`,
      );
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = getSpeechLang(language);

    rec.onresult = (e: any) => {
      // Accumulate every final segment we see into the ref so we never lose
      // text just because state hasn't flushed yet when stop is pressed.
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const txt = (res[0]?.transcript ?? "").trim();
          if (txt) transcriptRef.current = (transcriptRef.current + " " + txt).trim();
        } else {
          interim += " " + (res[0]?.transcript ?? "");
        }
      }
      // Show live caption while speaking — concat ref + current interim
      const live = (transcriptRef.current + " " + interim).trim();
      setTranscript(live);
    };

    rec.onerror = (e: any) => {
      console.warn("SpeechRecognition error:", e?.error);
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        setParseError("Microphone permission denied. Allow it in your browser to speak the order.");
      } else if (e?.error === "no-speech") {
        // Browser fires this when there's silence; let our own logic handle empty.
      } else if (e?.error === "audio-capture") {
        setParseError("No microphone detected. Plug one in and try again.");
      } else if (e?.error && e.error !== "aborted") {
        setParseError(`Speech recognition error: ${e.error}. Try again.`);
      }
    };

    rec.onend = () => {
      // The browser auto-stops after silence even if we never called stop().
      // If the user hasn't manually stopped yet, run the same post-stop flow.
      if (recognitionRef.current && !stoppingRef.current) {
        stopRecognitionAndProcess();
      }
    };

    recognitionRef.current = rec;

    try {
      rec.start();
      setIsRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch (err: any) {
      // start() throws if already started or in invalid state.
      console.warn("SpeechRecognition.start failed:", err);
      setParseError(`Couldn't start microphone: ${err?.message ?? "unknown"}.`);
      recognitionRef.current = null;
    }
  }, [language, stopRecognitionAndProcess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTimer();
      try { recognitionRef.current?.stop?.(); } catch {}
      recognitionRef.current = null;
    };
  }, []);

  const handleManualSubmit = async () => {
    const text = manualText.trim();
    if (!text) return;
    setIsProcessing(true);
    setParseError(null);
    try {
      const result = await apiPost<{ items: any[]; sourceLanguage: string | null }>(
        "/api/ai/parse-voice",
        { transcript: text, language },
      );
      if (Array.isArray(result.items) && result.items.length > 0) {
        const items: ParsedItem[] = result.items.map((i: any) => ({
          name: i.name ?? "Item",
          nameTe: i.nameTe ?? "",
          nameHi: i.nameHi ?? "",
          sourceLanguage: (result.sourceLanguage as any) ?? null,
          quantity: i.quantity ?? "1",
          available: true,
        }));
        setParsedItems(items);
      } else {
        throw new Error("AI returned no items");
      }
    } catch (err: any) {
      setParseError(`Couldn't parse: ${err?.message ?? "unknown"}. Try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProceed = () => {
    if (!parsedItems) return;
    const encoded = encodeURIComponent(JSON.stringify(parsedItems));
    router.push(`/review?items=${encoded}&mode=voice` as any);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("voiceTitle")}</Text>
        <LasaLogo size={28} /* logo in top-right keeps brand on every screen */ />
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {!parsedItems && !isProcessing ? (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.recordSection}>
            {Platform.OS === "web" && !speechSupported && (
              <View style={[styles.warnBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                <Feather name="alert-triangle" size={16} color="#F59E0B" />
                <Text style={styles.warnText}>
                  Voice input needs Chrome or Edge on a computer or Android. Safari and many in-app browsers don't support it. Use the photo option meanwhile.
                </Text>
              </View>
            )}
            {parseError && (
              <View style={[styles.warnBox, { backgroundColor: "#FEE2E2", borderColor: "#DC2626" }]}>
                <Feather name="alert-triangle" size={16} color="#DC2626" />
                <Text style={[styles.warnText, { color: "#7F1D1D" }]}>{parseError}</Text>
              </View>
            )}

            <Text style={[styles.instruction, { color: colors.mutedForeground }]}>
              {isRecording
                ? language === "te" ? "ఇప్పుడు మాట్లాడండి…" : language === "hi" ? "अब बोलिए…" : "Speak now…"
                : language === "te" ? "మైక్ నొక్కండి, ఆపై ఆపడానికి మళ్ళీ నొక్కండి" : language === "hi" ? "माइक दबाएँ, फिर रोकने के लिए दोबारा दबाएँ" : "Tap the mic to start, tap again to stop"}
            </Text>
            <Text style={[styles.example, { color: colors.mutedForeground }]}>{t("voiceExample")}</Text>

            {transcript ? (
              <View style={[styles.transcriptBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="mic" size={14} color={colors.primary} />
                <Text style={[styles.transcriptText, { color: colors.foreground }]}>{transcript}</Text>
              </View>
            ) : null}

            {/* Manual text fallback — always shown on native, toggleable on web */}
            {(showManualInput || Platform.OS !== "web") && (
              <View style={[styles.manualBox, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
                <Text style={[styles.manualLabel, { color: colors.mutedForeground }]}>
                  {language === "te" ? "లేదా ఇక్కడ టైప్ చేయండి:" : language === "hi" ? "या यहाँ टाइप करें:" : "Or type your order here:"}
                </Text>
                <TextInput
                  style={[styles.manualInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  placeholder={language === "te" ? "ఉదా: 5 కిలో బియ్యం, 2 కిలో పప్పు" : language === "hi" ? "उदा: 5 किलो चावल, 2 किलो दाल" : "e.g. 5 kg rice, 2 kg dal, 1 oil bottle"}
                  placeholderTextColor={colors.mutedForeground}
                  value={manualText}
                  onChangeText={setManualText}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity
                  style={[styles.manualBtn, { backgroundColor: manualText.trim() ? colors.primary : colors.border }]}
                  onPress={handleManualSubmit}
                  disabled={!manualText.trim()}
                >
                  <Feather name="arrow-right" size={18} color="#FFF" />
                  <Text style={styles.manualBtnText}>
                    {language === "te" ? "విశ్లేషించండి" : language === "hi" ? "विश्लेषण करें" : "Parse order"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {Platform.OS === "web" && !showManualInput && (
              <TouchableOpacity onPress={() => setShowManualInput(true)} style={styles.manualToggle}>
                <Text style={[styles.manualToggleText, { color: colors.mutedForeground }]}>
                  {language === "te" ? "బదులుగా టైప్ చేయండి" : language === "hi" ? "टाइप करें" : "Type instead"}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.micContainer}>
              <Animated.View style={pulseStyle}>
                <TouchableOpacity
                  style={[styles.micBtn, { backgroundColor: isRecording ? colors.destructive : colors.primary, opacity: speechSupported ? 1 : 0.5 }]}
                  onPress={isRecording ? stopRecognitionAndProcess : startRecording}
                  disabled={!speechSupported}
                  activeOpacity={0.9}
                >
                  <Feather name={isRecording ? "stop-circle" : "mic"} size={52} color="#FFF" />
                </TouchableOpacity>
              </Animated.View>
              {isRecording ? (
                <Animated.View entering={FadeIn.springify()} style={styles.recordingInfo}>
                  <View style={[styles.redDot, { backgroundColor: colors.destructive }]} />
                  <Text style={[styles.recordingTime, { color: colors.foreground }]}>{formatTime(recordSeconds)}</Text>
                  <Text style={[styles.recordingHint, { color: colors.mutedForeground }]}>
                    {language === "te" ? "ఆపడానికి నొక్కండి" : language === "hi" ? "रोकने के लिए दबाएँ" : "Tap to stop"}
                  </Text>
                </Animated.View>
              ) : (
                <Text style={[styles.micHint, { color: colors.mutedForeground }]}>
                  {language === "te" ? "మైక్ నొక్కండి" : language === "hi" ? "माइक दबाएँ" : "Tap to start"}
                </Text>
              )}
            </View>
          </Animated.View>
        ) : isProcessing ? (
          <Animated.View entering={FadeIn.springify()} style={styles.processingSection}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.processingText, { color: colors.foreground }]}>{t("processing")}</Text>
            <Text style={[styles.processingSubText, { color: colors.mutedForeground }]}>{t("processingSub")}</Text>
            {transcript ? (
              <View style={[styles.transcriptBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.transcriptText, { color: colors.mutedForeground }]}>"{transcript}"</Text>
              </View>
            ) : null}
          </Animated.View>
        ) : parsedItems ? (
          <Animated.View entering={FadeInDown.springify()} style={styles.resultSection}>
            {parseError && (
              <View style={[styles.warnBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                <Feather name="alert-triangle" size={16} color="#F59E0B" />
                <Text style={styles.warnText}>{parseError}</Text>
              </View>
            )}
            <Text style={[styles.resultTitle, { color: colors.foreground }]}>
              {parsedItems.length} {t("itemsFound")}
            </Text>
            {parsedItems.map((item, i) => (
              <View key={i} style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.itemLeft}>
                  <Text style={[styles.itemName, { color: colors.foreground }]}>{pickName(item, language)}</Text>
                  <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>{item.quantity}</Text>
                </View>
                <View style={[styles.dot, { backgroundColor: item.available ? colors.available : colors.unavailable }]} />
              </View>
            ))}
            <TouchableOpacity style={[styles.proceedBtn, { backgroundColor: colors.primary }]} onPress={handleProceed} activeOpacity={0.85}>
              <Text style={styles.proceedBtnText}>{t("reviewTitle")}</Text>
              <Feather name="arrow-right" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setParsedItems(null); setTranscript(""); transcriptRef.current = ""; setRecordSeconds(0); setParseError(null); }} style={styles.retakeBtn}>
              <Text style={[styles.retakeText, { color: colors.mutedForeground }]}>{t("reRecord")}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1 },
  content: { padding: 20, gap: 16 },
  recordSection: { alignItems: "center", gap: 16 },
  instruction: { fontSize: 16, fontFamily: "Inter_500Medium", textAlign: "center" },
  example: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", fontStyle: "italic", paddingHorizontal: 20 },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, width: "100%" },
  warnText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#92400E" },
  transcriptBox: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start", width: "100%" },
  transcriptText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  micContainer: { alignItems: "center", gap: 20, marginTop: 20 },
  micBtn: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
  recordingInfo: { alignItems: "center", gap: 6 },
  redDot: { width: 10, height: 10, borderRadius: 5 },
  recordingTime: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  recordingHint: { fontSize: 13, fontFamily: "Inter_400Regular" },
  micHint: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8 },
  processingSection: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, minHeight: 300 },
  processingText: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  processingSubText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  resultSection: { gap: 10 },
  resultTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 4 },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  proceedBtn: { height: 58, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  proceedBtnText: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold" },
  retakeBtn: { alignItems: "center", paddingVertical: 12 },
  retakeText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  manualBox: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  manualLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  manualInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  manualBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12 },
  manualBtnText: { color: "#FFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  manualToggle: { paddingVertical: 6 },
  manualToggleText: { fontSize: 13, fontFamily: "Inter_400Regular", textDecorationLine: "underline" },
});
