import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { checkInventoryAvailability } from "@/context/OrderContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { apiPost } from "@/constants/api";
import { pickName } from "@/data/wholesalers";
import { SampleListCard } from "@/components/SampleListCard";
import { LasaLogo } from "@/components/LasaLogo";

interface ParsedItem {
  name: string;
  nameTe?: string;
  nameHi?: string;
  sourceLanguage?: "en" | "te" | "hi" | null;
  quantity: string;
  available: boolean;
}

// NOTE: We deliberately do NOT keep a hard-coded fallback item list.
// Showing fake items (Toor Dal / Rice / Sunflower Oil) when Gemini fails
// was actively misleading — kiranas thought the AI had read their list
// and proceeded to order things they never wrote. If the AI fails we now
// surface a real error and let the user retake the photo, type items
// manually, or use the voice option.

async function imageUriToBase64(uri: string): Promise<{ base64: string; mimeType: string }> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const match = result.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) { reject(new Error("Invalid base64")); return; }
        resolve({ base64: match[2], mimeType: match[1] });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } else {
    const { default: FileSystem } = await import("expo-file-system" as any);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { base64, mimeType: "image/jpeg" };
  }
}

export default function ScanOrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const pickImage = async (fromCamera: boolean) => {
    try {
      const fn = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await fn({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, base64: false });
      if (!result.canceled && result.assets && result.assets[0]) {
        const uri = result.assets[0].uri;
        setImageUri(uri);
        setParsedItems(null);
        setAnalysisError(null);
        analyzeImage(uri);
      }
    } catch (err) {
      console.error("ImagePicker error:", err);
      setAnalysisError("Camera error. Please try again.");
    }
  };

  const analyzeImage = async (uri: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { base64, mimeType } = await imageUriToBase64(uri);
      const result = await apiPost<{ items: any[]; sourceLanguage: string | null }>("/api/ai/analyze-image", { imageBase64: base64, mimeType });

      if (result.items && Array.isArray(result.items) && result.items.length > 0) {
        const items: ParsedItem[] = result.items.map((i: any) => ({
          name: i.name ?? "Unknown Item",
          nameTe: i.nameTe ?? "",
          nameHi: i.nameHi ?? "",
          sourceLanguage: (result.sourceLanguage as any) ?? null,
          quantity: i.quantity ?? "1",
          // Real availability comes from the catalog match on the review screen;
          // mark true here so items are shown until reconciled.
          available: true,
        }));
        setParsedItems(items);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        throw new Error("No items detected");
      }
    } catch (err: any) {
      console.warn("Gemini analysis failed:", err?.message);
      // Differentiate quota/throttling from a genuinely unreadable image —
      // the message we show drives different user behaviour (wait & retry
      // vs retake the photo).
      const msg = String(err?.message ?? "");
      const isQuota = /429|quota|busy|rate/i.test(msg);
      setAnalysisError(
        isQuota
          ? "AI is busy right now. Please wait a minute and try again — or use voice order instead."
          : "Couldn't read the photo. Try a clearer, well-lit shot — or use voice order instead.",
      );
      // CRITICAL: do NOT seed fake items here. An empty parsedItems leaves
      // the user on the scan screen with the error banner — they can retake
      // or go back to the home screen and use voice / manual entry.
      setParsedItems(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setIsAnalyzing(false);
  };

  const handleProceed = () => {
    if (!parsedItems) return;
    const encoded = encodeURIComponent(JSON.stringify(parsedItems));
    router.push(`/review?items=${encoded}&mode=scan` as any);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Animated.View
        entering={FadeInDown.delay(50).springify()}
        style={[styles.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), borderBottomColor: colors.border }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("takePhotoTitle")}</Text>
        <LasaLogo size={28} /* logo in top-right keeps brand on every screen */ />
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {!imageUri ? (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.pickSection}>
            <SampleListCard variant="shopping" />
            <View style={[styles.previewBox, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
              <Feather name="camera" size={64} color={colors.primary} />
              <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>{t("photoHint")}</Text>
              <Text style={[styles.previewSub, { color: colors.mutedForeground }]}>
                {language === "te"
                  ? "స్పష్టంగా మరియు మంచి వెలుతురులో ఫోటో తీయండి"
                  : language === "hi"
                  ? "साफ और अच्छी रोशनी में फोटो लें"
                  : "Take a clear photo in good lighting for best results"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.cameraBtn, { backgroundColor: colors.primary }]}
              onPress={() => pickImage(true)}
              activeOpacity={0.85}
            >
              <Feather name="camera" size={24} color="#FFF" />
              <Text style={styles.cameraBtnText}>{t("takePhoto")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.galleryBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => pickImage(false)}
              activeOpacity={0.85}
            >
              <Feather name="image" size={20} color={colors.accent} />
              <Text style={[styles.galleryBtnText, { color: colors.accent }]}>{t("chooseGallery")}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.springify()} style={styles.analyzeSection}>
            <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />

            {isAnalyzing ? (
              <View style={[styles.analyzingBox, { backgroundColor: colors.secondary }]}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={[styles.analyzingText, { color: colors.foreground }]}>{t("analyzing")}</Text>
                <Text style={[styles.analyzingSubText, { color: colors.mutedForeground }]}>{t("analyzingSub")}</Text>
              </View>
            ) : parsedItems ? (
              <Animated.View entering={FadeInDown.springify()}>
                {analysisError && (
                  <View style={[styles.errorBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                    <Feather name="alert-triangle" size={16} color="#F59E0B" />
                    <Text style={styles.errorBoxText}>{analysisError}</Text>
                  </View>
                )}
                <Text style={[styles.resultTitle, { color: colors.foreground }]}>
                  {parsedItems.length} {t("itemsFound")}
                </Text>
                {parsedItems.map((item, i) => (
                  <View
                    key={i}
                    style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.itemLeft}>
                      <Text style={[styles.itemName, { color: colors.foreground }]}>{pickName(item, language)}</Text>
                      <Text style={[styles.itemQty, { color: colors.mutedForeground }]}>{item.quantity}</Text>
                    </View>
                    <View style={[styles.dot, { backgroundColor: item.available ? colors.available : colors.unavailable }]} />
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.proceedBtn, { backgroundColor: colors.primary }]}
                  onPress={handleProceed}
                  activeOpacity={0.85}
                >
                  <Text style={styles.proceedBtnText}>{t("reviewTitle")}</Text>
                  <Feather name="arrow-right" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setImageUri(null); setParsedItems(null); setAnalysisError(null); }}
                  style={styles.retakeBtn}
                >
                  <Text style={[styles.retakeText, { color: colors.mutedForeground }]}>{t("retakePhoto")}</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : analysisError ? (
              // AI couldn't read the photo (quota or unreadable). Tell the
              // user clearly and give them three ways out: retry the same
              // photo, retake a clearer one, or type the order by hand.
              <Animated.View entering={FadeInDown.springify()}>
                <View style={[styles.errorBox, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                  <Feather name="alert-triangle" size={16} color="#F59E0B" />
                  <Text style={styles.errorBoxText}>{analysisError}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.proceedBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                  onPress={() => imageUri && analyzeImage(imageUri)}
                  activeOpacity={0.85}
                >
                  <Feather name="refresh-cw" size={18} color="#FFF" />
                  <Text style={styles.proceedBtnText}>
                    {language === "te" ? "మళ్ళీ ప్రయత్నించండి" : language === "hi" ? "फिर से कोशिश करें" : "Try again"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.galleryBtn, { backgroundColor: colors.secondary, borderColor: colors.border, marginTop: 8 }]}
                  onPress={() => { setImageUri(null); setParsedItems(null); setAnalysisError(null); }}
                  activeOpacity={0.85}
                >
                  <Feather name="camera" size={18} color={colors.accent} />
                  <Text style={[styles.galleryBtnText, { color: colors.accent }]}>{t("retakePhoto")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.replace("/voice-order" as any)}
                  style={[styles.retakeBtn, { marginTop: 4 }]}
                >
                  <Text style={[styles.retakeText, { color: colors.primary }]}>
                    {language === "te" ? "వాయిస్ ఆర్డర్ ఉపయోగించండి →" : language === "hi" ? "वॉइस ऑर्डर का उपयोग करें →" : "Use voice order instead →"}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
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
  content: { padding: 20, gap: 14 },
  pickSection: { gap: 14 },
  previewBox: { height: 220, borderRadius: 20, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  previewHint: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  previewSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  cameraBtn: { height: 58, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  cameraBtnText: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold" },
  galleryBtn: { height: 52, borderRadius: 16, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  galleryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  analyzeSection: { gap: 14 },
  image: { width: "100%", height: 340, borderRadius: 16, backgroundColor: "#000" },
  analyzingBox: { borderRadius: 16, padding: 28, alignItems: "center", gap: 12 },
  analyzingText: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  analyzingSubText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8 },
  errorBoxText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#92400E" },
  resultTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  itemLeft: { flex: 1 },
  itemName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  itemQty: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  proceedBtn: { height: 58, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 },
  proceedBtnText: { color: "#FFF", fontSize: 17, fontFamily: "Inter_700Bold" },
  retakeBtn: { alignItems: "center", paddingVertical: 12 },
  retakeText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
